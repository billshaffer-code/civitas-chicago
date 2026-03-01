"""
CIVITAS – Authentication tests.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import UUID

import httpx
import pytest

from backend.app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

MOCK_USER_ID = UUID("00000000-0000-0000-0000-000000000099")
MOCK_USER = {
    "user_id": MOCK_USER_ID,
    "email": "alice@example.com",
    "password_hash": hash_password("securepass123"),
    "full_name": "Alice Test",
    "company_name": "Test Corp",
    "is_active": True,
    "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
    "updated_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
}


@pytest.fixture
def _no_auth_override():
    """Remove the autouse mock_auth so we can test real auth behavior."""
    from backend.app.main import app
    from backend.app.dependencies import get_current_user

    app.dependency_overrides.pop(get_current_user, None)
    yield
    # Re-add it after test (though autouse fixture will handle next test)


@pytest.fixture
async def auth_client(_no_auth_override):
    """httpx client without auth override."""
    with patch("backend.app.main.init_pool", new_callable=AsyncMock):
        with patch("backend.app.main.close_pool", new_callable=AsyncMock):
            from backend.app.main import app

            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac


# ── Password hashing tests ───────────────────────────────────────────────────


def test_hash_and_verify_password():
    hashed = hash_password("mypassword")
    assert verify_password("mypassword", hashed)
    assert not verify_password("wrongpassword", hashed)


# ── JWT tests ────────────────────────────────────────────────────────────────


def test_create_and_decode_access_token():
    token = create_access_token(MOCK_USER_ID)
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == str(MOCK_USER_ID)
    assert payload["type"] == "access"


def test_create_and_decode_refresh_token():
    token = create_refresh_token(MOCK_USER_ID)
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == str(MOCK_USER_ID)
    assert payload["type"] == "refresh"


def test_decode_invalid_token():
    assert decode_token("not.a.valid.token") is None


# ── Register endpoint ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_register_success(auth_client):
    with patch("backend.app.routers.auth.get_user_by_email", return_value=None):
        created = {
            "user_id": MOCK_USER_ID,
            "email": "new@example.com",
            "full_name": "New User",
            "company_name": None,
            "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
        }
        with patch("backend.app.routers.auth.create_user", return_value=created):
            resp = await auth_client.post("/api/v1/auth/register", json={
                "email": "new@example.com",
                "password": "securepass123",
                "full_name": "New User",
            })
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@example.com"
    assert body["full_name"] == "New User"


@pytest.mark.asyncio
async def test_register_duplicate_email(auth_client):
    with patch("backend.app.routers.auth.get_user_by_email", return_value=MOCK_USER):
        resp = await auth_client.post("/api/v1/auth/register", json={
            "email": "alice@example.com",
            "password": "securepass123",
            "full_name": "Alice Test",
        })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_weak_password(auth_client):
    resp = await auth_client.post("/api/v1/auth/register", json={
        "email": "weak@example.com",
        "password": "short",
        "full_name": "Weak User",
    })
    assert resp.status_code == 422


# ── Login endpoint ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success(auth_client):
    with patch("backend.app.routers.auth.get_user_by_email", return_value=MOCK_USER):
        with patch("backend.app.routers.auth.verify_password", return_value=True):
            resp = await auth_client.post("/api/v1/auth/login", json={
                "email": "alice@example.com",
                "password": "securepass123",
            })
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(auth_client):
    with patch("backend.app.routers.auth.get_user_by_email", return_value=MOCK_USER):
        with patch("backend.app.routers.auth.verify_password", return_value=False):
            resp = await auth_client.post("/api/v1/auth/login", json={
                "email": "alice@example.com",
                "password": "wrongpass123",
            })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email(auth_client):
    with patch("backend.app.routers.auth.get_user_by_email", return_value=None):
        resp = await auth_client.post("/api/v1/auth/login", json={
            "email": "noone@example.com",
            "password": "anything123",
        })
    assert resp.status_code == 401


# ── Refresh endpoint ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_success(auth_client):
    token = create_refresh_token(MOCK_USER_ID)
    with patch("backend.app.routers.auth.get_user_by_id", return_value=MOCK_USER):
        resp = await auth_client.post("/api/v1/auth/refresh", json={
            "refresh_token": token,
        })
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body


@pytest.mark.asyncio
async def test_refresh_invalid_token(auth_client):
    resp = await auth_client.post("/api/v1/auth/refresh", json={
        "refresh_token": "invalid.token.here",
    })
    assert resp.status_code == 401


# ── Protected route without token ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_protected_route_no_token(auth_client):
    resp = await auth_client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)  # HTTPBearer returns 401 or 403 depending on version


# ── /me with valid token ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_with_valid_token(auth_client):
    token = create_access_token(MOCK_USER_ID)
    with patch("backend.app.dependencies.get_user_by_id", return_value=MOCK_USER):
        resp = await auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "alice@example.com"
