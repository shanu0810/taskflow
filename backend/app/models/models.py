"""SQLAlchemy models for TaskFlow."""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Text, ForeignKey,
    Enum, JSON, TypeDecorator, CHAR
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


def utcnow():
    return datetime.now(timezone.utc)


# ─────────────── Cross-database UUID type ────────────────────────────────────

class UUIDType(TypeDecorator):
    """
    Platform-independent UUID type.
    Uses PostgreSQL's UUID type when on Postgres, CHAR(36) on other databases (e.g. SQLite for testing).
    Always stores/returns Python uuid.UUID objects.
    """
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        else:
            return str(value) if isinstance(value, uuid.UUID) else str(uuid.UUID(str(value)))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


# ─────────────── Enums ───────────────

class JobStatus(str, PyEnum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    RETRY = "RETRY"
    DEAD = "DEAD"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"


class JobPriority(str, PyEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class WorkerStatus(str, PyEnum):
    ONLINE = "ONLINE"
    BUSY = "BUSY"
    IDLE = "IDLE"
    OFFLINE = "OFFLINE"


# ─────────────── User ───────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    jobs = relationship("Job", back_populates="user", lazy="dynamic")


# ─────────────── Worker ───────────────

class Worker(Base):
    __tablename__ = "workers"

    id = Column(String(100), primary_key=True)  # e.g. "worker-01"
    hostname = Column(String(255), nullable=False)
    pid = Column(Integer, nullable=True)
    status = Column(Enum(WorkerStatus), default=WorkerStatus.IDLE, nullable=False)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    current_job_id = Column(UUIDType, nullable=True)
    jobs_processed = Column(Integer, default=0, nullable=False)
    jobs_failed = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    jobs = relationship("Job", back_populates="worker", foreign_keys="Job.worker_id", lazy="dynamic")


# ─────────────── Job ───────────────

class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id = Column(UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    task_type = Column(String(100), nullable=False, index=True)
    payload = Column(JSON, default=dict, nullable=False)
    priority = Column(Enum(JobPriority), default=JobPriority.MEDIUM, nullable=False, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False, index=True)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    timeout_seconds = Column(Integer, default=300, nullable=False)
    worker_id = Column(String(100), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True)
    result = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    queued_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="jobs")
    worker = relationship("Worker", back_populates="jobs", foreign_keys=[worker_id])
    logs = relationship("JobLog", back_populates="job", cascade="all, delete-orphan", order_by="JobLog.created_at")


# ─────────────── JobLog ───────────────

class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(UUIDType, primary_key=True, default=uuid.uuid4)
    job_id = Column(UUIDType, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    level = Column(String(20), default="INFO", nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    job = relationship("Job", back_populates="logs")
