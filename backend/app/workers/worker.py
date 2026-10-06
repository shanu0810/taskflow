"""
TaskFlow Worker Process.

Each worker:
1. Registers itself in the database
2. Polls the Redis queue for jobs
3. Picks up due scheduled jobs
4. Executes tasks from the registry
5. Handles retries with exponential backoff
6. Sends heartbeats
7. Handles graceful shutdown
"""

import os
import signal
import socket
import sys
import time
import uuid
import threading
from datetime import datetime, timezone, timedelta

# Adjust path so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.db.session import SessionLocal
from app.models.models import Job, JobLog, Worker, JobStatus, WorkerStatus
from app.services.queue import (
    dequeue_job, enqueue_job, get_due_scheduled_jobs,
    is_job_cancelled, set_worker_heartbeat, remove_from_queue
)
from app.workers.tasks import execute_task, get_registered_tasks


setup_logging()


WORKER_ID = os.environ.get("WORKER_ID", f"worker-{uuid.uuid4().hex[:6]}")
HOSTNAME = socket.gethostname()
PID = os.getpid()

_shutdown = threading.Event()


# ─────────────── Helpers ───────────────

def _db() -> Session:
    return SessionLocal()


def _log_job(db: Session, job_id, level: str, message: str):
    log = JobLog(job_id=job_id, level=level, message=message)
    db.add(log)
    db.commit()


def _update_job_status(db: Session, job: Job, status: JobStatus, **kwargs):
    job.status = status
    for k, v in kwargs.items():
        setattr(job, k, v)
    db.commit()
    db.refresh(job)


def _retry_delay(retry_count: int) -> float:
    """Exponential backoff: 1s, 2s, 4s, 8s..."""
    return min(2 ** retry_count, 64)


# ─────────────── Worker Registration ───────────────

def register_worker():
    db = _db()
    try:
        worker = db.query(Worker).filter(Worker.id == WORKER_ID).first()
        if not worker:
            worker = Worker(
                id=WORKER_ID,
                hostname=HOSTNAME,
                pid=PID,
                status=WorkerStatus.IDLE,
                started_at=datetime.now(timezone.utc),
            )
            db.add(worker)
        else:
            worker.hostname = HOSTNAME
            worker.pid = PID
            worker.status = WorkerStatus.IDLE
            worker.started_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Worker {WORKER_ID} registered (hostname={HOSTNAME}, pid={PID})")
    finally:
        db.close()


def update_worker_status(status: WorkerStatus, job_id=None):
    db = _db()
    try:
        worker = db.query(Worker).filter(Worker.id == WORKER_ID).first()
        if worker:
            worker.status = status
            worker.current_job_id = job_id
            worker.last_heartbeat = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


# ─────────────── Heartbeat thread ───────────────

def heartbeat_loop():
    """Sends heartbeat to Redis and DB every WORKER_HEARTBEAT_INTERVAL seconds."""
    while not _shutdown.is_set():
        try:
            set_worker_heartbeat(WORKER_ID)
            db = _db()
            try:
                worker = db.query(Worker).filter(Worker.id == WORKER_ID).first()
                if worker:
                    worker.last_heartbeat = datetime.now(timezone.utc)
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
        _shutdown.wait(settings.WORKER_HEARTBEAT_INTERVAL)


# ─────────────── Scheduled job promoter ───────────────

def promote_scheduled_jobs():
    """Move due scheduled jobs to the normal priority queues."""
    try:
        due_ids = get_due_scheduled_jobs()
        if not due_ids:
            return
        db = _db()
        try:
            for job_id in due_ids:
                job = db.query(Job).filter(Job.id == job_id).first()
                if not job:
                    continue
                if job.status == JobStatus.PENDING:
                    job.status = JobStatus.QUEUED
                    job.queued_at = datetime.now(timezone.utc)
                    db.commit()
                    enqueue_job(str(job.id), job.priority.value)
                    logger.info(f"Promoted scheduled job {job_id} to queue")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error promoting scheduled jobs: {e}")


# ─────────────── Job execution ───────────────

def execute_job(job_id: str):
    db = _db()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found in DB")
            return

        # Check if cancelled
        if is_job_cancelled(job_id) or job.status == JobStatus.CANCELLED:
            logger.info(f"Job {job_id} was cancelled, skipping")
            _log_job(db, job.id, "INFO", "Job was cancelled before execution")
            if job.status != JobStatus.CANCELLED:
                _update_job_status(db, job, JobStatus.CANCELLED)
            return

        # Mark RUNNING
        now = datetime.now(timezone.utc)
        _update_job_status(db, job, JobStatus.RUNNING,
                           started_at=now, worker_id=WORKER_ID)
        update_worker_status(WorkerStatus.BUSY, job_id=job.id)

        _log_job(db, job.id, "INFO", f"Worker {WORKER_ID} picked up job")
        _log_job(db, job.id, "INFO", "Execution started")

        try:
            # Execute with timeout via threading
            result_container = {}
            error_container = {}

            def run_task():
                try:
                    result_container["result"] = execute_task(job.task_type, job.payload)
                except Exception as ex:
                    error_container["error"] = ex

            t = threading.Thread(target=run_task, daemon=True)
            t.start()
            t.join(timeout=job.timeout_seconds)

            if t.is_alive():
                # Timeout
                _log_job(db, job.id, "ERROR", f"Job timed out after {job.timeout_seconds}s")
                _handle_failure(db, job, "Job timed out", timed_out=True)
            elif "error" in error_container:
                ex = error_container["error"]
                _log_job(db, job.id, "ERROR", f"Task error: {ex}")
                _handle_failure(db, job, str(ex))
            else:
                # SUCCESS
                result = result_container.get("result", {})
                completed = datetime.now(timezone.utc)
                _update_job_status(db, job, JobStatus.SUCCESS,
                                   result=result, completed_at=completed, error_message=None)
                _log_job(db, job.id, "INFO", "Execution completed successfully")
                _log_job(db, job.id, "INFO", "Job SUCCESS")

                # Increment worker stats
                worker = db.query(Worker).filter(Worker.id == WORKER_ID).first()
                if worker:
                    worker.jobs_processed += 1
                    db.commit()

        except Exception as e:
            _log_job(db, job.id, "ERROR", f"Unexpected error: {e}")
            _handle_failure(db, job, str(e))

    finally:
        update_worker_status(WorkerStatus.IDLE)
        db.close()


def _handle_failure(db: Session, job: Job, error: str, timed_out: bool = False):
    """Handle job failure: retry or mark DEAD/FAILED."""
    job.retry_count += 1
    job.error_message = error
    completed = datetime.now(timezone.utc)
    job.completed_at = completed

    # Increment failed counter
    worker = db.query(Worker).filter(Worker.id == WORKER_ID).first()
    if worker:
        worker.jobs_failed += 1
        db.commit()

    if job.retry_count <= job.max_retries:
        delay = _retry_delay(job.retry_count - 1)
        _log_job(db, job.id, "WARNING",
                 f"Job failed (attempt {job.retry_count}/{job.max_retries}). "
                 f"Retrying in {delay}s. Error: {error}")
        job.status = JobStatus.RETRY
        job.completed_at = None
        db.commit()

        time.sleep(delay)

        # Re-enqueue
        scheduled_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
        job.status = JobStatus.QUEUED
        job.queued_at = datetime.now(timezone.utc)
        db.commit()
        enqueue_job(str(job.id), job.priority.value)
        _log_job(db, job.id, "INFO", f"Job re-queued for retry {job.retry_count}")
    else:
        status = JobStatus.TIMEOUT if timed_out else JobStatus.DEAD
        _log_job(db, job.id, "ERROR",
                 f"Job permanently failed after {job.retry_count} attempts. Status: {status}")
        _update_job_status(db, job, status, completed_at=completed)


# ─────────────── Main loop ───────────────

def main():
    logger.info(f"TaskFlow Worker starting: {WORKER_ID}")
    logger.info(f"Registered tasks: {get_registered_tasks()}")

    register_worker()

    # Start heartbeat thread
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    hb_thread.start()

    # Graceful shutdown
    def shutdown(signum, frame):
        logger.info(f"Worker {WORKER_ID} shutting down...")
        _shutdown.set()
        update_worker_status(WorkerStatus.OFFLINE)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info(f"Worker {WORKER_ID} is polling for jobs...")

    while not _shutdown.is_set():
        try:
            # Promote due scheduled jobs first
            promote_scheduled_jobs()

            job_info = dequeue_job(WORKER_ID)
            if job_info:
                execute_job(job_info["job_id"])
            else:
                # No jobs, wait briefly
                _shutdown.wait(2)
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            _shutdown.wait(5)


if __name__ == "__main__":
    main()
