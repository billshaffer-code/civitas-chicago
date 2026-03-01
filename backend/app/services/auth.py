"""
CIVITAS – Authentication service: password hashing, JWT, user CRUD.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.app.config import settings
from backend.app.database import get_conn

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Password helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT helpers ──────────────────────────────────────────────────────────────

def create_access_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "refresh"},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        return None


# ── User CRUD ────────────────────────────────────────────────────────────────

async def get_user_by_email(email: str) -> Optional[dict]:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, email, password_hash, full_name, company_name, "
            "is_active, created_at, updated_at FROM users WHERE email = $1",
            email,
        )
    return dict(row) if row else None


async def get_user_by_id(user_id: UUID) -> Optional[dict]:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, email, password_hash, full_name, company_name, "
            "is_active, created_at, updated_at FROM users WHERE user_id = $1",
            user_id,
        )
    return dict(row) if row else None


async def create_user(
    email: str, password: str, full_name: str, company_name: Optional[str] = None
) -> dict:
    hashed = hash_password(password)
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, password_hash, full_name, company_name)
            VALUES ($1, $2, $3, $4)
            RETURNING user_id, email, full_name, company_name, created_at
            """,
            email, hashed, full_name, company_name,
        )
    return dict(row)
