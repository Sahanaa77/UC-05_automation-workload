"""
Health check tests for UC-05 Automation Workload Preview SaaS.
Verifies GET /health is public, returns 200 {"status": "ok"}, and reveals no tenant data.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint_public():
    """GET /health must be public and return 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok"}


def test_health_reveals_no_tenant_data():
    """GET /health must reveal no tenant context, ids, or private data."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    sensitive_keys = {"tenant", "tenant_id", "user", "user_id", "role", "plan", "quota", "secret"}
    assert not any(key in data for key in sensitive_keys)


def test_health_without_auth_header():
    """GET /health must succeed without any Authorization header."""
    response = client.get("/health", headers={})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
