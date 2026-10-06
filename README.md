# TaskFlow — Distributed Job Queue & Task Processing Platform

<div align="center">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python" />
</div>

---

## Overview

TaskFlow is a **production-grade distributed job queue platform** that lets you:

- Create and manage background jobs through a modern web UI or REST API
- Process jobs across multiple parallel workers
- Prioritise jobs (CRITICAL → HIGH → MEDIUM → LOW)
- Automatically retry failed jobs with exponential backoff
- Schedule jobs for future execution
- Monitor workers, queue depth, and analytics in real time

---

## Architecture

```
                    ┌──────────────────────┐
                    │      Next.js UI      │
                    │      Dashboard       │
                    └──────────┬───────────┘
                               │ HTTP
                               ▼
                    ┌──────────────────────┐
                    │     FastAPI API      │
                    │  Auth · Jobs · Stats │
                    └───────┬───────┬──────┘
                            │       │
                ┌───────────┘       └────────────┐
                ▼                                ▼
        ┌──────────────┐                 ┌──────────────┐
        │  PostgreSQL  │                 │    Redis     │
        │  Jobs · Users│                 │ Priority Qs  │
        │  Workers·Logs│                 │ Retry Queue  │
        └──────────────┘                 └──────┬───────┘
                                                │
                              ┌─────────────────┼────────┐
                              ▼                 ▼        ▼
                        ┌──────────┐      ┌──────────┐ ...
                        │ Worker 1 │      │ Worker 2 │
                        └──────────┘      └──────────┘
```

---

## Technology Stack

| Layer       | Technology            |
|-------------|-----------------------|
| Frontend    | Next.js 16, TypeScript, Tailwind CSS, Recharts |
| Backend     | Python 3.12, FastAPI, Pydantic v2 |
| ORM         | SQLAlchemy 2.0        |
| Database    | PostgreSQL 16         |
| Queue       | Redis 7 (sorted sets) |
| Auth        | JWT (python-jose) + bcrypt (passlib) |
| Workers     | Python background processes |
| Containers  | Docker + Docker Compose |
| Tests       | Pytest + FastAPI TestClient |

---

## Features

- **JWT Authentication** — Register, login, protected routes
- **Priority Queue** — CRITICAL / HIGH / MEDIUM / LOW via Redis sorted sets
- **Job Lifecycle** — PENDING → QUEUED → RUNNING → SUCCESS/FAILED/DEAD/CANCELLED/TIMEOUT
- **Retry System** — Automatic retry with exponential backoff (1s, 2s, 4s, 8s...)
- **Scheduled Jobs** — Schedule via `scheduled_at` field
- **Job Cancellation** — Cancel queued jobs before execution
- **Worker Heartbeat** — Workers auto-marked OFFLINE if heartbeat stops
- **Execution Logs** — Timestamped per-job logs
- **Analytics** — Jobs over time, task type breakdown, queue depth, avg execution time
- **Real Data Only** — Dashboard shows live data from the API, no mocks
- **Docker Compose** — One-command startup

---

## Project Structure

```
taskflow/
├── backend/
│   ├── app/
│   │   ├── api/v1/        # FastAPI routes (auth, jobs, workers, analytics)
│   │   ├── core/          # Config, logging, JWT security
│   │   ├── db/            # SQLAlchemy session
│   │   ├── models/        # ORM models (User, Job, Worker, JobLog)
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Redis queue service
│   │   ├── workers/       # Worker process + task registry
│   │   └── main.py        # FastAPI app entry point
│   ├── tests/             # Pytest test suite
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── requirements.txt
│
├── frontend/
│   ├── app/               # Next.js App Router pages
│   │   ├── dashboard/     # Dashboard with charts
│   │   ├── jobs/          # Jobs list + detail pages
│   │   ├── create-job/    # Job creation form
│   │   ├── workers/       # Workers monitoring
│   │   ├── login/         # Login page
│   │   └── register/      # Registration page
│   ├── components/ui/     # Reusable UI components
│   ├── lib/               # API client, auth context
│   ├── types/             # TypeScript types
│   └── Dockerfile
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── worker-system.md
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Quick Start (Docker)

> **Prerequisite**: Docker Desktop installed and running.

```bash
# 1. Clone and enter
cd taskflow

# 2. Copy environment file
cp .env.example .env

# 3. Start everything
docker compose up --build

# Services start at:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/api/docs
```

---

## Local Development

### Backend

```bash
cd backend

# Create venv
python -m venv venv
venv\Scripts\activate    # Windows
# source venv/bin/activate  # Linux/macOS

pip install -r requirements.txt

# Set env vars (copy .env.example and edit)
cp ../.env.example .env

# Run API (requires running Postgres + Redis)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Workers

```bash
cd backend

# Worker 1
WORKER_ID=worker-01 python -m app.workers.worker

# Worker 2 (in another terminal)
WORKER_ID=worker-02 python -m app.workers.worker
```

---

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest -v
```

Tests use an in-memory SQLite database — no PostgreSQL or Redis required.

---

## Environment Variables

| Variable                    | Default                              | Description                    |
|-----------------------------|--------------------------------------|--------------------------------|
| `DATABASE_URL`              | `postgresql+psycopg://...`           | PostgreSQL connection string   |
| `REDIS_URL`                 | `redis://redis:6379/0`               | Redis connection string        |
| `JWT_SECRET`                | *(must set)*                         | JWT signing secret             |
| `JWT_ALGORITHM`             | `HS256`                              | JWT algorithm                  |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60`                               | Token expiry in minutes        |
| `WORKER_HEARTBEAT_INTERVAL` | `10`                                 | Heartbeat interval (seconds)   |
| `WORKER_TIMEOUT_SECONDS`    | `30`                                 | Mark offline after N seconds   |
| `NEXT_PUBLIC_API_URL`       | `http://localhost:8000`              | Frontend → Backend URL         |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register user |
| POST | `/api/v1/auth/login` | Login, returns JWT |
| GET | `/api/v1/auth/me` | Current user info |
| GET | `/api/v1/jobs` | List jobs (paginated, filtered) |
| POST | `/api/v1/jobs` | Create job |
| GET | `/api/v1/jobs/{id}` | Get job details |
| POST | `/api/v1/jobs/{id}/cancel` | Cancel job |
| POST | `/api/v1/jobs/{id}/retry` | Retry failed job |
| GET | `/api/v1/jobs/{id}/logs` | Job execution logs |
| GET | `/api/v1/workers` | List workers |
| GET | `/api/v1/workers/{id}` | Worker details |
| GET | `/api/v1/analytics/overview` | Dashboard overview |
| GET | `/api/v1/analytics/jobs` | Jobs analytics |
| GET | `/health` | Health check |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |

Full interactive API docs: `http://localhost:8000/api/docs`

---

## Example: Create a Job via API

```bash
# 1. Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","username":"myuser","password":"mypassword"}'

# 2. Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"mypassword"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 3. Create a job
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Job",
    "task_type": "echo_task",
    "payload": {"message": "Hello TaskFlow!"},
    "priority": "HIGH",
    "max_retries": 3,
    "timeout_seconds": 60
  }'

# 4. Check job status
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/jobs/{job_id}
```

---

## Job Lifecycle

```
CREATE JOB
     │
     ▼
  PENDING  ──── (scheduled_at set) ──▶ waits in scheduled queue
     │
  (immediate)
     │
     ▼
  QUEUED   ◀────────────────────────── (retry re-enqueues here)
     │
  (worker picks up)
     │
     ▼
  RUNNING
     │
  ┌──┴──┐
  │     │
SUCCESS FAILED
         │
    retry_count < max_retries?
         │
    YES ─▶ RETRY ──▶ QUEUED (exponential backoff)
    NO  ─▶ DEAD
```

---

## Registered Task Types

| Task | Payload Fields | Description |
|------|---------------|-------------|
| `echo_task` | `message: string` | Echoes the message |
| `sleep_task` | `seconds: number` | Sleeps for N seconds |
| `calculate_task` | `operation, a, b` | Math: add/subtract/multiply/divide/power/sqrt |
| `random_failure_task` | `failure_rate: float (0-1)` | Randomly fails (tests retry) |
| `generate_report_task` | `report_type, rows` | Simulates report generation |
| `data_transform_task` | `data: array, transform` | Transforms string array |
| `send_notification_task` | `channel, recipient, message` | Simulates notification |

---

## Troubleshooting

**Postgres connection refused**: Make sure Docker is running and postgres service is healthy (`docker compose ps`)

**Redis connection refused**: Check `REDIS_URL` in `.env` uses correct service name (`redis`, not `localhost`)

**Worker not picking jobs**: Check worker logs with `docker compose logs worker1`. Ensure DB and Redis are both healthy first.

**JWT token expired**: Token expires after 60 minutes (configurable). Log in again.

**Frontend shows no data**: Verify `NEXT_PUBLIC_API_URL` points to the backend. In Docker, set to `http://localhost:8000` for browser-side requests.

---

## Architecture Deep Dive

See [docs/architecture.md](docs/architecture.md) for detailed information about:
- Redis sorted set priority queue implementation
- Worker heartbeat and offline detection
- Exponential backoff retry algorithm
- Scheduled job promotion mechanism
- Security model
