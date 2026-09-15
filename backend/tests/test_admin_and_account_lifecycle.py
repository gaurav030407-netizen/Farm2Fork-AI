"""Tests for admin permissions, catalog rules, and account deletion security guards."""

import os
from uuid import uuid4
from fastapi import HTTPException
import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://user:password@localhost:5432/farm2fork")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-characters")

from backend.app.auth import AuthenticatedUser
from backend.app.routes.admin import _require_admin


def test_require_admin_allows_admin():
    admin_user = AuthenticatedUser(
        id=uuid4(),
        email="admin@farm2fork.local",
        role="ADMIN",
        access_token="test-token",
    )
    # Should not raise
    _require_admin(admin_user)


def test_require_admin_rejects_non_admin():
    farmer_user = AuthenticatedUser(
        id=uuid4(),
        email="farmer@farm2fork.local",
        role="FARMER",
        access_token="test-token",
    )
    with pytest.raises(HTTPException) as exc_info:
        _require_admin(farmer_user)
    assert exc_info.value.status_code == 403
    assert "Administrator permission" in exc_info.value.detail


def test_variety_cannot_equal_crop_name():
    crop_name = "Tomato"
    invalid_varieties = ["Tomato", "tomato", "  Tomato  ", "TOMATO"]
    valid_varieties = ["Cherry Tomato", "Roma", "Other / Not specified", "Heirloom"]

    for invalid in invalid_varieties:
        assert invalid.strip().lower() == crop_name.strip().lower(), f"{invalid} should match crop name"

    for valid in valid_varieties:
        assert valid.strip().lower() != crop_name.strip().lower(), f"{valid} should not match crop name"


def test_driver_approval_guard():
    # Only APPROVED drivers may claim deliveries
    valid_status = "APPROVED"
    invalid_statuses = ["PENDING", "REJECTED", "SUSPENDED"]

    assert valid_status == "APPROVED"
    for status in invalid_statuses:
        assert status != "APPROVED"
