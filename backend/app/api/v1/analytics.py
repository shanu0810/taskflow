"""Analytics API routes."""

from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import Job, Worker, JobStatus, WorkerStatus
from app.schemas.schemas import AnalyticsOverview, AnalyticsJobs, JobsOverTime
from app.services.queue import get_queue_sizes

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
def analytics_overview(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    def job_count(s: JobStatus) -> int:
        return db.query(func.count(Job.id)).filter(Job.status == s).scalar() or 0

    return AnalyticsOverview(
        total_jobs=db.query(func.count(Job.id)).scalar() or 0,
        pending=job_count(JobStatus.PENDING),
        queued=job_count(JobStatus.QUEUED),
        running=job_count(JobStatus.RUNNING),
        success=job_count(JobStatus.SUCCESS),
        failed=job_count(JobStatus.FAILED),
        dead=job_count(JobStatus.DEAD),
        cancelled=job_count(JobStatus.CANCELLED),
        timeout=job_count(JobStatus.TIMEOUT),
        retry=job_count(JobStatus.RETRY),
        active_workers=db.query(func.count(Worker.id)).filter(
            Worker.status.in_([WorkerStatus.ONLINE, WorkerStatus.BUSY, WorkerStatus.IDLE])
        ).scalar() or 0,
        idle_workers=db.query(func.count(Worker.id)).filter(
            Worker.status == WorkerStatus.IDLE
        ).scalar() or 0,
        offline_workers=db.query(func.count(Worker.id)).filter(
            Worker.status == WorkerStatus.OFFLINE
        ).scalar() or 0,
        queue_sizes=get_queue_sizes(),
    )


@router.get("/jobs", response_model=AnalyticsJobs)
def analytics_jobs(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    jobs = db.query(Job).filter(Job.created_at >= since).all()

    by_date: dict[str, dict] = defaultdict(lambda: {"success": 0, "failed": 0, "total": 0})
    durations = []
    task_types: dict[str, int] = defaultdict(int)

    for job in jobs:
        date_str = job.created_at.strftime("%Y-%m-%d")
        by_date[date_str]["total"] += 1
        if job.status == JobStatus.SUCCESS:
            by_date[date_str]["success"] += 1
            if job.started_at and job.completed_at:
                dur = (job.completed_at - job.started_at).total_seconds()
                durations.append(dur)
        elif job.status in (JobStatus.FAILED, JobStatus.DEAD):
            by_date[date_str]["failed"] += 1
        task_types[job.task_type] += 1

    jobs_over_time = [
        JobsOverTime(date=d, success=v["success"], failed=v["failed"], total=v["total"])
        for d, v in sorted(by_date.items())
    ]
    avg_exec = sum(durations) / len(durations) if durations else 0.0

    return AnalyticsJobs(
        jobs_over_time=jobs_over_time,
        avg_execution_time_seconds=round(avg_exec, 2),
        task_type_breakdown=dict(task_types),
    )
