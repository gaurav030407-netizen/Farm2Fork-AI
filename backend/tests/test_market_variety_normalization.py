"""Regression tests for the official commodity -> variety mapping."""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://user:password@localhost:5432/farm2fork")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-thirty-two-characters")

from datetime import datetime, timezone

from backend.app.routes.market_intelligence import _normalize_record, _official_variety


def record(commodity: str, variety: str | None):
    payload = {"Commodity": commodity}
    if variety is not None:
        payload["Variety"] = variety
    return _normalize_record(payload, datetime.now(timezone.utc))


def test_commodity_and_actual_variety_remain_independent():
    item = record("Potato", "Jyoti")
    assert item and item.commodity == "Potato" and item.variety == "Jyoti"


def test_actual_named_variety_is_not_replaced():
    item = record("Potato", "Kufri Pukhraj")
    assert item and item.variety == "Kufri Pukhraj"


def test_other_is_not_the_crop_name():
    assert record("Potato", "Other").variety == "Other / Not specified"
    assert record("Tomato", "Other").variety == "Other / Not specified"


def test_missing_variety_never_falls_back_to_commodity():
    item = record("Potato", None)
    assert item and item.variety == "Not specified" and item.variety != item.commodity


def test_only_actual_official_values_are_deduplicated():
    values = {record("Potato", value).variety for value in ("Jyoti", "Kufri Pukhraj", "Jyoti", "Other")}
    assert values == {"Jyoti", "Kufri Pukhraj", "Other / Not specified"}


def test_crop_name_is_allowed_only_when_the_source_variety_really_says_so():
    assert _official_variety("Potato") == "Potato"
    assert _official_variety(None) != "Potato"
