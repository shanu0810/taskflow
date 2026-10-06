"""Shared pytest fixtures for TaskFlow tests."""

import os
import pytest
from contextlib import asynccontextmanager
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ─── IMPORTANT: Override DB URL before any app imports ───────────────────────
TEST_DB_URL = "sqlite:///./test_taskflow.db"
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REDIS_URL"] = "redis://localhost:6379/0"  # won't be connected in tests
os.environ["JWT_SECRET"] = "test-secret-key"

# Now we can safely import app modules
from app.db.session import Base, get_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.models import User  # noqa: E402

# ─── Override the engine used by the app ────────────────────────────────────
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Patch app.db.session engine so lifespan uses SQLite
import app.db.session as db_session_module
db_session_module.engine = test_engine
db_session_module.SessionLocal = TestSessionLocal

# Now import the app (after patching)
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    # Patch lifespan so it doesn't try to connect to Postgres
    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    with patch.object(app.router, 'lifespan_context', noop_lifespan):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    # Clean up any existing user first
    existing = db.query(User).filter(User.email == "test@taskflow.io").first()
    if existing:
        db.delete(existing)
        db.commit()

    user = User(
        email="test@taskflow.io",
        username="testuser",
        hashed_password=hash_password("testpassword123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.query(User).filter(User.email == "test@taskflow.io").delete()
    db.commit()


@pytest.fixture
def auth_headers(client, test_user):
    resp = client.post("/api/v1/auth/login", json={
        "email": "test@taskflow.io",
        "password": "testpassword123"
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
