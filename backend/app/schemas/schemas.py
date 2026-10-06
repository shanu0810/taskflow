"""Pydantic schemas for TaskFlow API."""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.models import JobStatus, JobPriority, WorkerStatus


# ─────────────── Auth ───────────────

class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─────────────── Job ───────────────

class JobCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    task_type: str = Field(min_length=1, max_length=100)
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: JobPriority = JobPriority.MEDIUM
    max_retries: int = Field(default=3, ge=0, le=10)
    timeout_seconds: int = Field(default=300, ge=1, le=3600)
    scheduled_at: Optional[datetime] = None


class JobOut(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    name: str
    description: Optional[str]
    task_type: str
    payload: dict
    priority: JobPriority
    status: JobStatus
    retry_count: int
    max_retries: int
    timeout_seconds: int
    worker_id: Optional[str]
    result: Optional[Any]
    error_message: Optional[str]
    created_at: datetime
    queued_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    scheduled_at: Optional[datetime]

    model_config = {"from_attributes": True}


class JobListOut(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[JobOut]


class JobLogOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    level: str
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ─────────────── Worker ───────────────

class WorkerOut(BaseModel):
    id: str
    hostname: str
    pid: Optional[int]
    status: WorkerStatus
    last_heartbeat: Optional[datetime]
    current_job_id: Optional[uuid.UUID]
    jobs_processed: int
    jobs_failed: int
    started_at: datetime

    model_config = {"from_attributes": True}


class WorkerHeartbeat(BaseModel):
    worker_id: str
    hostname: str
    pid: Optional[int] = None
    status: WorkerStatus = WorkerStatus.IDLE
    current_job_id: Optional[uuid.UUID] = None


# ─────────────── Analytics ───────────────

class AnalyticsOverview(BaseModel):
    total_jobs: int
    pending: int
    queued: int
    running: int
    success: int
    failed: int
    dead: int
    cancelled: int
    timeout: int
    retry: int
    active_workers: int
    idle_workers: int
    offline_workers: int
    queue_sizes: dict[str, int]


class JobsOverTime(BaseModel):
    date: str
    success: int
    failed: int
    total: int


class AnalyticsJobs(BaseModel):
    jobs_over_time: list[JobsOverTime]
    avg_execution_time_seconds: float
    task_type_breakdown: dict[str, int]


# ─────────────── Health ───────────────

class HealthResponse(BaseModel):
    status: str
    database: str
    redis: str
    version: str
