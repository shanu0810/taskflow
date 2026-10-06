"""Jobs API routes — full CRUD + lifecycle operations."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import Job, JobLog, JobStatus, JobPriority, User
from app.schemas.schemas import JobCreate, JobOut, JobListOut, JobLogOut
from app.services.queue import enqueue_job, remove_from_queue, mark_job_cancelled_in_redis
from app.workers.tasks import get_registered_tasks

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _get_job_or_404(job_id: str, db: Session) -> Job:
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(400, "Invalid job ID format")
    job = db.query(Job).filter(Job.id == jid).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/task-types", response_model=list[str])
def list_task_types():
    """Return all registered task types."""
    return get_registered_tasks()


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    body: JobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate task type
    if body.task_type not in get_registered_tasks():
        raise HTTPException(400, f"Unknown task_type '{body.task_type}'. "
                                 f"Valid types: {get_registered_tasks()}")

    now = datetime.now(timezone.utc)
    is_scheduled = body.scheduled_at and body.scheduled_at > now

    job = Job(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        task_type=body.task_type,
        payload=body.payload,
        priority=body.priority,
        max_retries=body.max_retries,
        timeout_seconds=body.timeout_seconds,
        scheduled_at=body.scheduled_at,
        status=JobStatus.PENDING,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Add to queue
    if is_scheduled:
        enqueue_job(str(job.id), job.priority.value, scheduled_at=body.scheduled_at)
        log_msg = f"Job scheduled for {body.scheduled_at.isoformat()}"
    else:
        job.status = JobStatus.QUEUED
        job.queued_at = now
        db.commit()
        db.refresh(job)
        enqueue_job(str(job.id), job.priority.value)
        log_msg = "Job queued"

    # Initial log
    log = JobLog(job_id=job.id, level="INFO", message=log_msg)
    db.add(log)
    db.commit()
    db.refresh(job)
    return job


@router.get("", response_model=JobListOut)
def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    task_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Job)
    if status:
        try:
            q = q.filter(Job.status == JobStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    if priority:
        try:
            q = q.filter(Job.priority == JobPriority(priority))
        except ValueError:
            raise HTTPException(400, f"Invalid priority: {priority}")
    if task_type:
        q = q.filter(Job.task_type == task_type)
    if search:
        q = q.filter(Job.name.ilike(f"%{search}%"))

    total = q.count()
    items = q.order_by(Job.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_job_or_404(job_id, db)


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_or_404(job_id, db)
    if job.status not in (JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RETRY):
        raise HTTPException(400, f"Cannot cancel job with status {job.status}")

    # Mark cancelled in Redis to prevent workers from executing
    mark_job_cancelled_in_redis(str(job.id))
    # Remove from queue
    remove_from_queue(str(job.id), job.priority.value)

    job.status = JobStatus.CANCELLED
    job.completed_at = datetime.now(timezone.utc)
    db.commit()

    log = JobLog(job_id=job.id, level="INFO", message="Job cancelled by user")
    db.add(log)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/retry", response_model=JobOut)
def retry_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_or_404(job_id, db)
    if job.status not in (JobStatus.FAILED, JobStatus.DEAD, JobStatus.TIMEOUT, JobStatus.CANCELLED):
        raise HTTPException(400, f"Cannot retry job with status {job.status}")

    now = datetime.now(timezone.utc)
    job.status = JobStatus.QUEUED
    job.queued_at = now
    job.retry_count = 0  # Reset retries on manual retry
    job.error_message = None
    job.result = None
    job.started_at = None
    job.completed_at = None
    job.worker_id = None
    db.commit()

    enqueue_job(str(job.id), job.priority.value)

    log = JobLog(job_id=job.id, level="INFO", message="Job manually retried")
    db.add(log)
    db.commit()
    db.refresh(job)
    return job


@router.get("/{job_id}/logs", response_model=list[JobLogOut])
def get_job_logs(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_or_404(job_id, db)
    return job.logs
