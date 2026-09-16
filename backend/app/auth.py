"""JWT bearer-token verification for FastAPI routes."""

from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text

from .config import settings
from .database.connection import get_engine


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    """The safe identity fields accepted from a verified JWT."""

    id: UUID
    email: str | None
    role: str
    access_token: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    """Verify a Node-issued JWT and load its current profile."""

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = UUID(str(payload["sub"]))
        claim_id = UUID(str(payload["id"]))
        claim_email = payload.get("email")
        if claim_email is not None:
            claim_email = str(claim_email).strip().lower() or None
        role = str(payload["role"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if claim_id != user_id or role not in {"FARMER", "BUYER", "CONSUMER", "DRIVER", "ADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication role.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with get_engine().connect() as connection:
        profile = connection.execute(
            text("SELECT email FROM public.profiles WHERE id = :id AND role = :role AND account_status = 'ACTIVE' AND ((email IS NULL AND :email IS NULL) OR lower(email) = :email) AND (email_verified = true OR phone_verified = true)"),
            {"id": user_id, "role": role, "email": claim_email},
        ).mappings().one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is no longer available.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    return AuthenticatedUser(
        id=user_id,
        email=profile["email"],
        role=role,
        access_token=credentials.credentials,
    )


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser | None:
    """Extract authenticated user if a valid bearer token is provided, else return None."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
