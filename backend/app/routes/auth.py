"""Authentication and profile onboarding endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from ..auth import AuthenticatedUser, get_current_user
from ..database.connection import get_engine
from ..schemas.auth import (
    AuthMeResponse,
    ProfileCreateRequest,
    ProfileResponse,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me", response_model=AuthMeResponse)
def auth_me(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthMeResponse:
    """Return the verified Supabase user and its Farm2Fork role."""

    with get_engine().connect() as connection:
        profile = connection.execute(
            text("SELECT id, role FROM public.profiles WHERE id = :profile_id"),
            {"profile_id": user.id},
        ).mappings().one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Farm2Fork profile has not been created yet.",
        )

    return AuthMeResponse(
        id=profile["id"],
        email=user.email,
        role=profile["role"],
    )


@router.post(
    "/profile",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_profile(
    payload: ProfileCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> ProfileResponse:
    """Create one role-specific Farm2Fork profile for the verified user."""

    try:
        with get_engine().begin() as connection:
            profile = connection.execute(
                text(
                    """
                    SELECT id, role
                    FROM public.profiles
                    WHERE id = :profile_id
                    FOR UPDATE
                    """
                ),
                {"profile_id": user.id},
            ).mappings().one_or_none()

            if profile is not None and profile["role"] != payload.role:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This account already has a different Farm2Fork role.",
                )

            if profile is None:
                connection.execute(
                    text(
                        """
                        INSERT INTO public.profiles
                            (id, name, role, mobile, location)
                        VALUES
                            (:profile_id, :name, :role, :mobile, :location)
                        """
                    ),
                    {
                        "profile_id": user.id,
                        "name": payload.name,
                        "role": payload.role,
                        "mobile": payload.mobile,
                        "location": payload.location,
                    },
                )

            farmer_id = None
            buyer_id = None
            if payload.role == "FARMER":
                opposite = connection.execute(
                    text(
                        """
                        SELECT id
                        FROM public.buyers
                        WHERE profile_id = :profile_id
                        """
                    ),
                    {"profile_id": user.id},
                ).scalar_one_or_none()
                if opposite is not None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This account already has a buyer record.",
                    )

                farmer_id = connection.execute(
                    text(
                        """
                        SELECT id
                        FROM public.farmers
                        WHERE profile_id = :profile_id
                        """
                    ),
                    {"profile_id": user.id},
                ).scalar_one_or_none()
                if farmer_id is None:
                    farmer_id = connection.execute(
                        text(
                            """
                            INSERT INTO public.farmers
                                (profile_id, farm_name, location)
                            VALUES
                                (:profile_id, :farm_name, :location)
                            RETURNING id
                            """
                        ),
                        {
                            "profile_id": user.id,
                            "farm_name": payload.farm_name,
                            "location": payload.location,
                        },
                    ).scalar_one()
            else:
                opposite = connection.execute(
                    text(
                        """
                        SELECT id
                        FROM public.farmers
                        WHERE profile_id = :profile_id
                        """
                    ),
                    {"profile_id": user.id},
                ).scalar_one_or_none()
                if opposite is not None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This account already has a farmer record.",
                    )

                buyer_id = connection.execute(
                    text(
                        """
                        SELECT id
                        FROM public.buyers
                        WHERE profile_id = :profile_id
                        """
                    ),
                    {"profile_id": user.id},
                ).scalar_one_or_none()
                if buyer_id is None:
                    buyer_id = connection.execute(
                        text(
                            """
                            INSERT INTO public.buyers
                                (profile_id, business_name, location)
                            VALUES
                                (:profile_id, :business_name, :location)
                            RETURNING id
                            """
                        ),
                        {
                            "profile_id": user.id,
                            "business_name": payload.business_name,
                            "location": payload.location,
                        },
                    ).scalar_one()

    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A profile already exists for this account.",
        ) from None

    return ProfileResponse(
        id=user.id,
        email=user.email,
        role=payload.role,
        farmer_id=farmer_id,
        buyer_id=buyer_id,
    )