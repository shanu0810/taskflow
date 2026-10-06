from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "TaskFlow"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+psycopg://taskflow:taskflow_dev_password@postgres:5432/taskflow"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production-use-a-long-random-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://frontend:3000"]

    # Worker
    WORKER_HEARTBEAT_INTERVAL: int = 10  # seconds
    WORKER_TIMEOUT_SECONDS: int = 30  # mark offline if no heartbeat

    # Queue key names in Redis
    QUEUE_PREFIX: str = "taskflow:queue"
    SCHEDULED_QUEUE_KEY: str = "taskflow:scheduled"
    WORKER_HEARTBEAT_PREFIX: str = "taskflow:worker:heartbeat"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
