"""Tests for Jobs API."""
import uuid
from unittest.mock import patch


def _job_payload(**kwargs):
    return {
        "name": "Test Job",
        "task_type": "echo_task",
        "payload": {"message": "hello"},
        "priority": "MEDIUM",
        "max_retries": 2,
        "timeout_seconds": 60,
        **kwargs,
    }


def test_list_task_types(client, auth_headers):
    resp = client.get("/api/v1/jobs/task-types", headers=auth_headers)
    assert resp.status_code == 200
    types = resp.json()
    assert "echo_task" in types
    assert "sleep_task" in types


def test_create_job(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"):
        resp = client.post("/api/v1/jobs", json=_job_payload(), headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Job"
    assert data["status"] in ("QUEUED", "PENDING")
    assert data["task_type"] == "echo_task"


def test_create_job_invalid_task_type(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"):
        resp = client.post("/api/v1/jobs", json=_job_payload(task_type="hack_the_planet"),
                           headers=auth_headers)
    assert resp.status_code == 400


def test_create_job_no_auth(client):
    resp = client.post("/api/v1/jobs", json=_job_payload())
    assert resp.status_code in (401, 403)


def test_list_jobs(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"):
        client.post("/api/v1/jobs", json=_job_payload(), headers=auth_headers)
    resp = client.get("/api/v1/jobs", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


def test_get_job(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"):
        create_resp = client.post("/api/v1/jobs", json=_job_payload(), headers=auth_headers)
    job_id = create_resp.json()["id"]
    resp = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


def test_get_job_not_found(client, auth_headers):
    resp = client.get(f"/api/v1/jobs/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


def test_cancel_job(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"), \
         patch("app.api.v1.jobs.remove_from_queue"), \
         patch("app.api.v1.jobs.mark_job_cancelled_in_redis"):
        create_resp = client.post("/api/v1/jobs", json=_job_payload(), headers=auth_headers)
        job_id = create_resp.json()["id"]
        resp = client.post(f"/api/v1/jobs/{job_id}/cancel", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "CANCELLED"


def test_get_job_logs(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"):
        create_resp = client.post("/api/v1/jobs", json=_job_payload(), headers=auth_headers)
    job_id = create_resp.json()["id"]
    resp = client.get(f"/api/v1/jobs/{job_id}/logs", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) > 0


def test_retry_cancelled_job(client, auth_headers):
    with patch("app.api.v1.jobs.enqueue_job"), \
         patch("app.api.v1.jobs.remove_from_queue"), \
         patch("app.api.v1.jobs.mark_job_cancelled_in_redis"):
        create_resp = client.post("/api/v1/jobs", json=_job_payload(), headers=auth_headers)
        job_id = create_resp.json()["id"]
        client.post(f"/api/v1/jobs/{job_id}/cancel", headers=auth_headers)

    with patch("app.api.v1.jobs.enqueue_job"):
        resp = client.post(f"/api/v1/jobs/{job_id}/retry", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "QUEUED"
