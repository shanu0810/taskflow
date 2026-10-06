"""Workers API routes."""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import Worker, WorkerStatus, User
from app.schemas.schemas import WorkerOut, WorkerHeartbeat
from app.core.config import settings

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get("", response_model=list[WorkerOut])
def list_workers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all workers and mark any that missed heartbeat as OFFLINE."""
    workers = db.query(Worker).all()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.WORKER_TIMEOUT_SECONDS)
    for w in workers:
        hb = w.last_heartbeat.replace(tzinfo=None) if w.last_heartbeat and w.last_heartbeat.tzinfo else w.last_heartbeat
        cutoff_naive = cutoff.replace(tzinfo=None)
        if w.status != WorkerStatus.OFFLINE and hb and hb < cutoff_naive:
            w.status = WorkerStatus.OFFLINE
    db.commit()
    return workers


@router.get("/{worker_id}", response_model=WorkerOut)
def get_worker(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(404, "Worker not found")
    return worker


@router.post("/heartbeat", response_model=WorkerOut)
def worker_heartbeat(
    body: WorkerHeartbeat,
    db: Session = Depends(get_db),
):
    """Called by worker processes to register heartbeat (no auth required)."""
    worker = db.query(Worker).filter(Worker.id == body.worker_id).first()
    if not worker:
        worker = Worker(
            id=body.worker_id,
            hostname=body.hostname,
            pid=body.pid,
            status=body.status,
            started_at=datetime.now(timezone.utc),
        )
        db.add(worker)
    else:
        worker.hostname = body.hostname
        worker.pid = body.pid
        worker.status = body.status
        worker.current_job_id = body.current_job_id
    worker.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    db.refresh(worker)
    return worker
