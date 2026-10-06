# TaskFlow Architecture

## Redis Priority Queue

TaskFlow uses Redis **sorted sets** (ZSETs) for priority queues, with one ZSET per priority level:

```
taskflow:queue:CRITICAL  (score = timestamp → lowest score = oldest = next to process)
taskflow:queue:HIGH
taskflow:queue:MEDIUM
taskflow:queue:LOW
taskflow:scheduled       (score = scheduled_at unix timestamp)
```

Workers iterate priorities in order `CRITICAL → HIGH → MEDIUM → LOW`, calling `ZPOPMIN` on each queue. This guarantees CRITICAL jobs are always dequeued before HIGH, etc.

### Scheduled Jobs

Scheduled jobs are stored in `taskflow:scheduled` with a score = their `scheduled_at` unix timestamp. Every worker iteration calls `ZRANGEBYSCORE -inf <now>` to find due jobs, promotes them to the normal priority queue, and removes them from the scheduled set.

### Job Cancellation

When a job is cancelled, a Redis key `taskflow:cancelled:{job_id}` is set with a 1-hour TTL. Workers check this key before executing a job and skip it if present. The job is also removed from any queue via `ZREM`.

## Worker Architecture

### Worker Lifecycle

```
start
  │
  ├─ register_worker() → upserts Worker row in DB
  │
  ├─ start heartbeat thread (every WORKER_HEARTBEAT_INTERVAL seconds)
  │     └─ updates Redis key + DB last_heartbeat timestamp
  │
  └─ main loop:
        ├─ promote_scheduled_jobs() (due scheduled → priority queue)
        ├─ dequeue_job() (CRITICAL → HIGH → MEDIUM → LOW)
        ├─ if job found: execute_job()
        └─ else: sleep 2s
```

### Job Execution (execute_job)

1. Load job from DB
2. Check cancellation flag in Redis
3. Mark status = RUNNING, set worker_id, started_at
4. Execute task in a separate thread with `join(timeout=timeout_seconds)`
5. If thread still alive → TIMEOUT flow
6. If error raised → failure flow
7. If success → mark SUCCESS, store result, log

### Retry with Exponential Backoff

```
attempt 1 fails → wait 1s  → re-enqueue
attempt 2 fails → wait 2s  → re-enqueue
attempt 3 fails → wait 4s  → re-enqueue
attempt 4 fails → wait 8s  → DEAD (if max_retries = 3)
```

### Heartbeat & Offline Detection

- Workers send a heartbeat every `WORKER_HEARTBEAT_INTERVAL` seconds
- The `/api/v1/workers` endpoint checks each worker's `last_heartbeat`
- If `now - last_heartbeat > WORKER_TIMEOUT_SECONDS`, status is set to OFFLINE
- This is checked on every list request (lazy evaluation)

## Security Model

- **Password hashing**: bcrypt via passlib
- **JWT**: HS256, configurable expiry
- **Task registry**: only pre-registered task functions can be executed; no arbitrary code
- **Input validation**: Pydantic v2 on all request bodies
- **SQL injection**: prevented by SQLAlchemy ORM (parameterised queries)
- **CORS**: configured to allow only specified origins

## Database Schema

```
users
  id (UUID PK), email (unique), username (unique),
  hashed_password, is_active, is_superuser, created_at, updated_at

workers
  id (VARCHAR PK, e.g. "worker-01"), hostname, pid, status (enum),
  last_heartbeat, current_job_id, jobs_processed, jobs_failed, started_at

jobs
  id (UUID PK), user_id (FK→users), name, description,
  task_type, payload (JSONB), priority (enum), status (enum),
  retry_count, max_retries, timeout_seconds,
  worker_id (FK→workers), result (JSONB), error_message,
  created_at, queued_at, started_at, completed_at, scheduled_at

job_logs
  id (UUID PK), job_id (FK→jobs CASCADE), level, message, created_at
```
