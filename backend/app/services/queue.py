"""Redis connection and queue service for TaskFlow."""

import json
import uuid
import time
from datetime import datetime, timezone
from typing import Optional

import redis

from app.core.config import settings
from app.core.logging import logger


# Priority score mapping (lower score = higher priority in ZSET)
PRIORITY_SCORES = {
    "CRITICAL": 0,
    "HIGH": 1000,
    "MEDIUM": 2000,
    "LOW": 3000,
}


def get_redis() -> redis.Redis:
    """Return a Redis connection."""
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_queue_key(priority: str) -> str:
    """Return queue key for a given priority."""
    return f"{settings.QUEUE_PREFIX}:{priority}"


def enqueue_job(job_id: str, priority: str, scheduled_at: Optional[datetime] = None) -> None:
    """
    Add a job to the Redis priority queue.
    Uses a sorted set per priority level keyed by timestamp.
    For scheduled jobs, score = scheduled timestamp; otherwise current time.
    """
    r = get_redis()
    queue_key = get_queue_key(priority)

    if scheduled_at:
        score = scheduled_at.timestamp()
        # Store in scheduled queue
        r.zadd(settings.SCHEDULED_QUEUE_KEY, {job_id: score})
        logger.info(f"Job {job_id} scheduled at {scheduled_at}")
    else:
        score = time.time()
        r.zadd(queue_key, {job_id: score})
        logger.info(f"Job {job_id} enqueued with priority {priority}")


def dequeue_job(worker_id: str) -> Optional[dict]:
    """
    Pop the highest-priority job from the queue.
    Iterates CRITICAL → HIGH → MEDIUM → LOW.
    Uses ZRANGE + ZREM (compatible with Redis 3.0+).
    Returns job_id or None.
    """
    r = get_redis()
    priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

    for priority in priorities:
        queue_key = get_queue_key(priority)
        # Fetch the lowest-score item (oldest in this priority)
        results = r.zrange(queue_key, 0, 0, withscores=True)
        if results:
            job_id, score = results[0]
            # Atomically remove it
            removed = r.zrem(queue_key, job_id)
            if removed:
                logger.info(f"Worker {worker_id} dequeued job {job_id} from {priority} queue")
                return {"job_id": job_id, "priority": priority}
            # Another worker grabbed it between ZRANGE and ZREM — try next

    return None


def get_queue_sizes() -> dict[str, int]:
    """Return queue sizes for all priorities."""
    r = get_redis()
    sizes = {}
    for priority in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        sizes[priority] = r.zcard(get_queue_key(priority))
    sizes["SCHEDULED"] = r.zcard(settings.SCHEDULED_QUEUE_KEY)
    return sizes


def remove_from_queue(job_id: str, priority: str) -> bool:
    """Remove a job from queue (for cancellation)."""
    r = get_redis()
    queue_key = get_queue_key(priority)
    removed = r.zrem(queue_key, job_id)
    if not removed:
        # Try scheduled queue
        removed = r.zrem(settings.SCHEDULED_QUEUE_KEY, job_id)
    return bool(removed)


def set_worker_heartbeat(worker_id: str) -> None:
    """Store worker heartbeat timestamp in Redis."""
    r = get_redis()
    key = f"{settings.WORKER_HEARTBEAT_PREFIX}:{worker_id}"
    r.setex(key, settings.WORKER_TIMEOUT_SECONDS * 2, str(time.time()))


def get_due_scheduled_jobs() -> list[str]:
    """Return scheduled job IDs whose scheduled_at has passed."""
    r = get_redis()
    now = time.time()
    results = r.zrangebyscore(settings.SCHEDULED_QUEUE_KEY, "-inf", now)
    if results:
        r.zremrangebyscore(settings.SCHEDULED_QUEUE_KEY, "-inf", now)
    return results


def mark_job_cancelled_in_redis(job_id: str) -> None:
    """Mark a job as cancelled so workers skip it."""
    r = get_redis()
    r.setex(f"taskflow:cancelled:{job_id}", 3600, "1")


def is_job_cancelled(job_id: str) -> bool:
    r = get_redis()
    return bool(r.exists(f"taskflow:cancelled:{job_id}"))


def ping_redis() -> bool:
    """Check if Redis is reachable."""
    try:
        r = get_redis()
        return r.ping()
    except Exception:
        return False
