"""Safe, read-only bounded retrieval tools for the Farm2Fork AI assistant."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import text

from ...database.connection import get_engine

logger = logging.getLogger(__name__)


def get_market_price(
    commodity: str,
    variety: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market: str | None = None,
) -> dict[str, Any]:
    """Retrieve the latest official market observations for a given crop and location."""
    clauses = ["source_commodity ILIKE :commodity"]
    params: dict[str, Any] = {"commodity": f"%{commodity.strip()}%"}

    if variety and variety.strip() and variety.strip().lower() not in {"all", "all varieties", "not specified"}:
        clauses.append("source_variety ILIKE :variety")
        params["variety"] = f"%{variety.strip()}%"

    if state and state.strip() and state.strip().lower() not in {"all", "all states"}:
        clauses.append("state ILIKE :state")
        params["state"] = f"%{state.strip()}%"

    if district and district.strip() and district.strip().lower() not in {"all", "all districts"}:
        clauses.append("district ILIKE :district")
        params["district"] = f"%{district.strip()}%"

    if market and market.strip() and market.strip().lower() not in {"all", "all markets"}:
        clauses.append("market ILIKE :market")
        params["market"] = f"%{market.strip()}%"

    query = f"""
        SELECT source_commodity, source_variety, state, district, market,
               min_price, max_price, modal_price, unit, arrival_date, source_updated_at
        FROM public.market_prices
        WHERE {' AND '.join(clauses)}
        ORDER BY arrival_date DESC NULLS LAST, source_updated_at DESC
        LIMIT 5
    """

    try:
        with get_engine().connect() as conn:
            rows = conn.execute(text(query), params).mappings().all()

        if not rows:
            return {
                "status": "no_data",
                "message": f"No verified official market observations found for '{commodity}'.",
            }

        records = []
        for r in rows:
            records.append({
                "commodity": r["source_commodity"],
                "variety": r["source_variety"] or "Not specified",
                "state": r["state"],
                "district": r["district"],
                "market": r["market"],
                "min_price": r["min_price"],
                "max_price": r["max_price"],
                "modal_price": r["modal_price"],
                "unit": r["unit"] or "₹ / quintal",
                "arrival_date": str(r["arrival_date"]) if r["arrival_date"] else None,
            })

        return {
            "status": "success",
            "count": len(records),
            "latest_record": records[0],
            "records": records,
        }
    except Exception as err:
        logger.warning("Error fetching market price in AI tool: %s", err)
        return {"status": "error", "message": "Market database query encountered an error."}


def get_crop_varieties(crop_name: str) -> dict[str, Any]:
    """Retrieve verified official varieties registered for a crop."""
    try:
        clean_name = " ".join("".join(c.lower() if c.isalnum() else " " for c in crop_name).split())
        query = """
            SELECT v.name
            FROM public.crop_varieties v
            JOIN public.crops c ON c.id = v.crop_id
            WHERE c.normalized_name ILIKE :crop OR c.name ILIKE :crop
            ORDER BY v.name
        """
        with get_engine().connect() as conn:
            rows = conn.execute(text(query), {"crop": f"%{clean_name}%"}).scalars().all()

        if not rows:
            return {
                "crop": crop_name,
                "varieties": [],
                "message": f"No verified varieties found in catalog for crop '{crop_name}'.",
            }

        return {
            "crop": crop_name,
            "varieties": list(rows),
        }
    except Exception as err:
        logger.warning("Error fetching crop varieties in AI tool: %s", err)
        return {"crop": crop_name, "varieties": [], "message": "Variety catalog is temporarily unavailable."}


def get_nearby_listings(
    crop: str | None = None,
    state: str | None = None,
    district: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Retrieve public active crop listings from verified farmers."""
    clauses = ["l.status = 'ACTIVE'"]
    params: dict[str, Any] = {"limit": min(limit, 10)}

    if crop and crop.strip():
        clauses.append("(c.name ILIKE :crop OR l.crop_name ILIKE :crop)")
        params["crop"] = f"%{crop.strip()}%"

    if state and state.strip():
        clauses.append("l.state ILIKE :state")
        params["state"] = f"%{state.strip()}%"

    if district and district.strip():
        clauses.append("l.district ILIKE :district")
        params["district"] = f"%{district.strip()}%"

    query = f"""
        SELECT l.id, coalesce(c.name, l.crop_name) as crop_name,
               coalesce(cv.name, l.variety_name, 'Not specified') as variety_name,
               l.quantity, l.unit, l.price_per_unit, l.state, l.district,
               f.farm_name
        FROM public.listings l
        LEFT JOIN public.crops c ON c.id = l.crop_id
        LEFT JOIN public.crop_varieties cv ON cv.id = l.variety_id
        LEFT JOIN public.farmers f ON f.id = l.farmer_id
        WHERE {' AND '.join(clauses)}
        ORDER BY l.created_at DESC
        LIMIT :limit
    """

    try:
        with get_engine().connect() as conn:
            rows = conn.execute(text(query), params).mappings().all()

        listings = []
        for r in rows:
            listings.append({
                "id": str(r["id"]),
                "crop": r["crop_name"],
                "variety": r["variety_name"],
                "quantity": float(r["quantity"]) if r["quantity"] is not None else 0,
                "unit": r["unit"] or "kg",
                "price_per_unit": float(r["price_per_unit"]) if r["price_per_unit"] is not None else 0,
                "location": f"{r['district'] or ''}, {r['state'] or ''}".strip(", "),
                "farm_name": r["farm_name"] or "Verified Farm",
            })

        return {"status": "success", "count": len(listings), "listings": listings}
    except Exception as err:
        logger.warning("Error fetching listings in AI tool: %s", err)
        return {"status": "error", "message": "Listings service temporarily unavailable."}


def get_listing_details(listing_id: str) -> dict[str, Any]:
    """Retrieve safe public details of a specific listing."""
    try:
        query = """
            SELECT l.id, coalesce(c.name, l.crop_name) as crop_name,
                   coalesce(cv.name, l.variety_name, 'Not specified') as variety_name,
                   l.quantity, l.unit, l.price_per_unit, l.description, l.harvest_date,
                   l.state, l.district, l.status, f.farm_name
            FROM public.listings l
            LEFT JOIN public.crops c ON c.id = l.crop_id
            LEFT JOIN public.crop_varieties cv ON cv.id = l.variety_id
            LEFT JOIN public.farmers f ON f.id = l.farmer_id
            WHERE l.id = :id
        """
        with get_engine().connect() as conn:
            row = conn.execute(text(query), {"id": listing_id}).mappings().one_or_none()

        if not row:
            return {"status": "not_found", "message": "Listing not found."}

        return {
            "status": "success",
            "listing": {
                "id": str(row["id"]),
                "crop": row["crop_name"],
                "variety": row["variety_name"],
                "quantity": float(row["quantity"]) if row["quantity"] is not None else 0,
                "unit": row["unit"],
                "price_per_unit": float(row["price_per_unit"]) if row["price_per_unit"] is not None else 0,
                "description": row["description"] or "",
                "harvest_date": str(row["harvest_date"]) if row["harvest_date"] else None,
                "state": row["state"],
                "district": row["district"],
                "status": row["status"],
                "farm_name": row["farm_name"] or "Verified Farm",
            },
        }
    except Exception as err:
        logger.warning("Error fetching listing details in AI tool: %s", err)
        return {"status": "error", "message": "Unable to load listing details."}


def get_user_profile_summary(user_id: UUID) -> dict[str, Any]:
    """Return safe profile summary without passwords, OTPs, or private tokens."""
    try:
        query = """
            SELECT id, email, name, role, account_status, state, district,
                   email_verified, phone_verified
            FROM public.profiles
            WHERE id = :id
        """
        with get_engine().connect() as conn:
            row = conn.execute(text(query), {"id": user_id}).mappings().one_or_none()

        if not row:
            return {"status": "not_found", "message": "Profile not found."}

        return {
            "status": "success",
            "name": row["name"],
            "role": row["role"],
            "account_status": row["account_status"],
            "state": row["state"],
            "district": row["district"],
            "is_verified": bool(row["email_verified"] or row["phone_verified"]),
        }
    except Exception as err:
        logger.warning("Error fetching profile summary in AI tool: %s", err)
        return {"status": "error", "message": "Profile query unavailable."}


def get_order_status(order_id: str, user_id: UUID) -> dict[str, Any]:
    """Check order status only if it belongs to the authenticated user."""
    try:
        query = """
            SELECT o.id, o.status, o.quantity, o.unit, o.total_amount, o.created_at,
                   coalesce(c.name, l.crop_name) as crop_name
            FROM public.orders o
            JOIN public.listings l ON l.id = o.listing_id
            LEFT JOIN public.crops c ON c.id = l.crop_id
            LEFT JOIN public.farmers f ON f.id = l.farmer_id
            WHERE o.id = :order_id
              AND (o.buyer_id = :user_id OR f.profile_id = :user_id)
        """
        with get_engine().connect() as conn:
            row = conn.execute(text(query), {"order_id": order_id, "user_id": user_id}).mappings().one_or_none()

        if not row:
            return {"status": "not_found", "message": "Order not found or access denied."}

        return {
            "status": "success",
            "order_id": str(row["id"]),
            "order_status": row["status"],
            "crop": row["crop_name"],
            "quantity": float(row["quantity"]) if row["quantity"] is not None else 0,
            "unit": row["unit"],
            "total_amount": float(row["total_amount"]) if row["total_amount"] is not None else 0,
            "created_at": str(row["created_at"]),
        }
    except Exception as err:
        logger.warning("Error fetching order status in AI tool: %s", err)
        return {"status": "error", "message": "Order query unavailable."}


def get_admin_operational_stats() -> dict[str, Any]:
    """Operational statistics for ADMIN queries only."""
    try:
        with get_engine().connect() as conn:
            pending_drivers = conn.execute(text("""
                SELECT count(*) FROM public.drivers WHERE status = 'PENDING'
            """)).scalar_one_or_none() or 0

            active_listings = conn.execute(text("""
                SELECT count(*) FROM public.listings WHERE status = 'ACTIVE'
            """)).scalar_one_or_none() or 0

            sync_status_row = conn.execute(text("""
                SELECT upstream_status, last_success_at, records_imported, last_error_category
                FROM public.market_sync_status WHERE id = true
            """)).mappings().one_or_none()

        sync_info = dict(sync_status_row) if sync_status_row else {}
        return {
            "pending_driver_verifications": pending_drivers,
            "active_listings_count": active_listings,
            "market_sync_status": sync_info.get("upstream_status", "UNKNOWN"),
            "last_market_sync": str(sync_info.get("last_success_at")) if sync_info.get("last_success_at") else "Never",
            "records_imported": sync_info.get("records_imported", 0),
            "last_error": sync_info.get("last_error_category"),
        }
    except Exception as err:
        logger.warning("Error fetching admin stats in AI tool: %s", err)
        return {
            "pending_driver_verifications": 0,
            "active_listings_count": 0,
            "market_sync_status": "UNAVAILABLE",
            "error": "Database statistics temporarily unavailable.",
        }
