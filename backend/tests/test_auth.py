"""Tests for authentication endpoints."""
import uuid


def test_register(client):
    uid = uuid.uuid4().hex[:8]
    resp = client.post("/api/v1/auth/register", json={
        "email": f"user_{uid}@test.io",
        "username": f"user_{uid}",
        "password": "password123",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == f"user_{uid}@test.io"
    assert "id" in data


def test_register_duplicate_email(client):
    uid = uuid.uuid4().hex[:8]
    payload = {"email": f"dup_{uid}@test.io", "username": f"dup1_{uid}", "password": "pass12345"}
    client.post("/api/v1/auth/register", json=payload)
    payload["username"] = f"dup2_{uid}"
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 400


def test_login(client, test_user):
    resp = client.post("/api/v1/auth/login", json={
        "email": "test@taskflow.io",
        "password": "testpassword123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client, test_user):
    resp = client.post("/api/v1/auth/login", json={
        "email": "test@taskflow.io",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


def test_me(client, test_user, auth_headers):
    resp = client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@taskflow.io"


def test_me_no_token(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)
