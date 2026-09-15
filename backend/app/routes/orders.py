"""Authenticated PostgreSQL-backed buyer and farmer order endpoints."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..auth import AuthenticatedUser, get_current_user
from ..database.connection import get_engine
from ..schemas.orders import (
    OrderCreateRequest,
    OrderItemResponse,
    OrderResponse,
    OrderStatus,
    OrderStatusUpdateRequest,
)
from ..routes.listings import _signed_image_url


router = APIRouter(prefix="/api", tags=["orders"])
farmer_router = APIRouter(prefix="/api/farmer", tags=["farmer-orders"])


def _require_role(user: AuthenticatedUser, role: str) -> None:
    if user.role != role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only {role.lower()} accounts can access this endpoint.",
        )


def _buyer_id(connection, user: AuthenticatedUser) -> UUID:
    buyer_id = connection.execute(
        text("SELECT id FROM public.buyers WHERE profile_id = :profile_id"),
        {"profile_id": user.id},
    ).scalar_one_or_none()
    if buyer_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Buyer profile not found.")
    return buyer_id


def _farmer_id(connection, user: AuthenticatedUser) -> UUID:
    farmer_id = connection.execute(
        text("SELECT id FROM public.farmers WHERE profile_id = :profile_id"),
        {"profile_id": user.id},
    ).scalar_one_or_none()
    if farmer_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Farmer profile not found.")
    return farmer_id


async def _response_from_rows(order_row: dict, item_rows: list[dict]) -> OrderResponse:
    items = []
    for row in item_rows:
        items.append(
            OrderItemResponse(
                id=row["id"],
                crop_listing_id=row["crop_listing_id"],
                crop_name=row["crop_name"],
                variety=row["variety"],
                image_url=await _signed_image_url(row["image_url"]),
                quantity=float(row["quantity"]),
                unit=row["unit"],
                price=float(row["price"]),
                subtotal=float(row["subtotal"]),
            )
        )
    return OrderResponse(
        id=order_row["id"],
        status=order_row["status"],
        payment_status=order_row.get("payment_status", "CREATED"),
        total_amount=float(order_row["total_amount"]),
        delivery_location=order_row["delivery_location"],
        created_at=order_row["created_at"],
        updated_at=order_row["updated_at"],
        buyer_name=order_row.get("buyer_name"),
        farmer_name=order_row.get("farmer_name"),
        items=items,
    )


def _order_rows(connection, order_id: UUID) -> tuple[dict | None, list[dict]]:
    order = connection.execute(
        text(
            """
                 SELECT o.id, o.status, o.payment_status, o.total_amount, o.delivery_location, o.created_at, o.updated_at,
                     buyer_profile.name AS buyer_name, farmer_profile.name AS farmer_name
            FROM public.orders AS o
                 JOIN public.buyers AS buyer ON buyer.id = o.buyer_id
                 JOIN public.profiles AS buyer_profile ON buyer_profile.id = buyer.profile_id
                 JOIN public.farmers AS farmer ON farmer.id = o.farmer_id
                 JOIN public.profiles AS farmer_profile ON farmer_profile.id = farmer.profile_id
                 WHERE o.id = :order_id
            """
        ),
        {"order_id": order_id},
    ).mappings().one_or_none()
    items = connection.execute(
        text(
            """
                 SELECT oi.id, oi.crop_listing_id, cl.crop_name, cl.variety, cl.image_url,
                     cl.unit, oi.quantity, oi.price, oi.subtotal
            FROM public.order_items AS oi
            JOIN public.crop_listings AS cl ON cl.id = oi.crop_listing_id
            WHERE oi.order_id = :order_id
            ORDER BY oi.created_at
            """
        ),
        {"order_id": order_id},
    ).mappings().all()
    return (dict(order) if order else None), [dict(item) for item in items]


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(payload: OrderCreateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> OrderResponse:
    if user.role not in {"BUYER", "CONSUMER"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyer and consumer accounts can place orders.")
    try:
        with get_engine().begin() as connection:
            buyer_id = _buyer_id(connection, user)
            listing = connection.execute(
                text(
                    """
                    SELECT id, farmer_id, price, quantity, status
                    FROM public.crop_listings
                    WHERE id = :listing_id
                    FOR UPDATE
                    """
                ),
                {"listing_id": payload.crop_listing_id},
            ).mappings().one_or_none()
            if listing is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop listing not found.")
            if listing["status"] != "ACTIVE":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Crop listing is not available.")
            if payload.quantity > Decimal(str(listing["quantity"])):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Requested quantity exceeds availability.")

            price = Decimal(str(listing["price"]))
            subtotal = (payload.quantity * price).quantize(Decimal("0.01"))
            connection.execute(
                text("""UPDATE public.crop_listings SET quantity = quantity - :quantity, status = CASE WHEN quantity = :quantity THEN 'SOLD' ELSE status END, updated_at = now() WHERE id = :listing_id"""),
                {"quantity": payload.quantity, "listing_id": payload.crop_listing_id},
            )
            order = connection.execute(
                text(
                    """
                    INSERT INTO public.orders (buyer_id, farmer_id, status, total_amount, delivery_location)
                    VALUES (:buyer_id, :farmer_id, 'PENDING', :total_amount, :delivery_location)
                    RETURNING id, status, total_amount, delivery_location, created_at, updated_at
                    """
                ),
                {
                    "buyer_id": buyer_id,
                    "farmer_id": listing["farmer_id"],
                    "total_amount": subtotal,
                    "delivery_location": payload.delivery_location,
                },
            ).mappings().one()
            connection.execute(
                text(
                    """
                    INSERT INTO public.order_items (order_id, crop_listing_id, quantity, price, subtotal)
                    VALUES (:order_id, :listing_id, :quantity, :price, :subtotal)
                    """
                ),
                {
                    "order_id": order["id"],
                    "listing_id": payload.crop_listing_id,
                    "quantity": payload.quantity,
                    "price": price,
                    "subtotal": subtotal,
                },
            )
            order_row, item_rows = _order_rows(connection, order["id"])
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order could not be created.") from None
    return await _response_from_rows(order_row, item_rows)


@router.get("/orders", response_model=list[OrderResponse])
async def list_buyer_orders(user: AuthenticatedUser = Depends(get_current_user)) -> list[OrderResponse]:
    _require_role(user, "BUYER")
    with get_engine().connect() as connection:
        buyer_id = _buyer_id(connection, user)
        order_ids = connection.execute(
            text("SELECT id FROM public.orders WHERE buyer_id = :buyer_id ORDER BY created_at DESC"),
            {"buyer_id": buyer_id},
        ).scalars().all()
        result = []
        for order_id in order_ids:
            order_row, item_rows = _order_rows(connection, order_id)
            result.append(await _response_from_rows(order_row, item_rows))
        return result


async def _get_authorized_order(order_id: UUID, user: AuthenticatedUser) -> tuple[dict, list[dict]]:
    with get_engine().connect() as connection:
        if user.role == "BUYER":
            owner_id = _buyer_id(connection, user)
            allowed = connection.execute(text("SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = :order_id AND buyer_id = :owner_id)"), {"order_id": order_id, "owner_id": owner_id}).scalar()
        elif user.role == "FARMER":
            owner_id = _farmer_id(connection, user)
            allowed = connection.execute(
                text("""SELECT EXISTS (SELECT 1 FROM public.orders AS o JOIN public.order_items AS oi ON oi.order_id = o.id WHERE o.id = :order_id AND o.farmer_id = :owner_id)"""),
                {"order_id": order_id, "owner_id": owner_id},
            ).scalar()
        else:
            allowed = False
        if not allowed:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        order_row, item_rows = _order_rows(connection, order_id)
    return order_row, item_rows


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> OrderResponse:
    order_row, item_rows = await _get_authorized_order(order_id, user)
    return await _response_from_rows(order_row, item_rows)


@farmer_router.get("/orders", response_model=list[OrderResponse])
async def list_farmer_orders(user: AuthenticatedUser = Depends(get_current_user)) -> list[OrderResponse]:
    _require_role(user, "FARMER")
    with get_engine().connect() as connection:
        farmer_id = _farmer_id(connection, user)
        order_ids = connection.execute(
            text("SELECT id FROM public.orders WHERE farmer_id = :farmer_id ORDER BY created_at DESC"),
            {"farmer_id": farmer_id},
        ).scalars().all()
        result = []
        for order_id in order_ids:
            order_row, item_rows = _order_rows(connection, order_id)
            result.append(await _response_from_rows(order_row, item_rows))
        return result


def _transition_allowed(current: str, requested: str) -> bool:
    return requested in {
        "PENDING": {"ACCEPTED", "REJECTED"},
        "ACCEPTED": {"PROCESSING"},
        "PROCESSING": {"OUT_FOR_DELIVERY"},
        "OUT_FOR_DELIVERY": {"DELIVERED"},
    }.get(current, set())


@farmer_router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def update_farmer_order_status(order_id: UUID, payload: OrderStatusUpdateRequest, user: AuthenticatedUser = Depends(get_current_user)) -> OrderResponse:
    _require_role(user, "FARMER")
    if payload.status == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Farmers cannot cancel orders.")
    try:
        with get_engine().begin() as connection:
            farmer_id = _farmer_id(connection, user)
            order = connection.execute(text("SELECT id, status FROM public.orders WHERE id = :order_id AND farmer_id = :farmer_id FOR UPDATE"), {"order_id": order_id, "farmer_id": farmer_id}).mappings().one_or_none()
            if order is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this order.")
            if not _transition_allowed(order["status"], payload.status):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invalid order status transition.")
            connection.execute(text("UPDATE public.orders SET status = :new_status, updated_at = now() WHERE id = :order_id"), {"new_status": payload.status, "order_id": order_id})
            if payload.status == "OUT_FOR_DELIVERY":
                connection.execute(
                    text("""
                           INSERT INTO public.delivery_jobs (order_id, pickup_location, delivery_location, pickup_latitude, pickup_longitude)
                        SELECT o.id, f.location, o.delivery_location
                               , fp.latitude, fp.longitude
                        FROM public.orders o
                        JOIN public.farmers f ON f.id = o.farmer_id
                           JOIN public.profiles fp ON fp.id = f.profile_id
                        WHERE o.id = :order_id
                        ON CONFLICT (order_id) DO NOTHING
                    """),
                    {"order_id": order_id},
                )
            if payload.status == "REJECTED":
                connection.execute(text("""UPDATE public.crop_listings AS cl SET quantity = cl.quantity + oi.quantity, updated_at = now() FROM public.order_items AS oi WHERE oi.order_id = :order_id AND oi.crop_listing_id = cl.id"""), {"order_id": order_id})
            order_row, item_rows = _order_rows(connection, order_id)
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order status could not be updated.") from None
    return await _response_from_rows(order_row, item_rows)


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(order_id: UUID, user: AuthenticatedUser = Depends(get_current_user)) -> OrderResponse:
    _require_role(user, "BUYER")
    try:
        with get_engine().begin() as connection:
            buyer_id = _buyer_id(connection, user)
            order = connection.execute(text("SELECT id, status FROM public.orders WHERE id = :order_id AND buyer_id = :buyer_id FOR UPDATE"), {"order_id": order_id, "buyer_id": buyer_id}).mappings().one_or_none()
            if order is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
            if order["status"] != "PENDING":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This order can no longer be cancelled.")
            connection.execute(text("UPDATE public.orders SET status = 'CANCELLED', updated_at = now() WHERE id = :order_id"), {"order_id": order_id})
            connection.execute(text("""UPDATE public.crop_listings AS cl SET quantity = cl.quantity + oi.quantity, updated_at = now() FROM public.order_items AS oi WHERE oi.order_id = :order_id AND oi.crop_listing_id = cl.id"""), {"order_id": order_id})
            order_row, item_rows = _order_rows(connection, order_id)
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Order could not be cancelled.") from None
    return await _response_from_rows(order_row, item_rows)