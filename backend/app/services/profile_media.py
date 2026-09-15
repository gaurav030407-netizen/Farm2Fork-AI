from pathlib import PurePosixPath

import httpx

from ..config import settings


async def signed_profile_photo_url(path: str | None) -> str | None:
    if not path or not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    safe_path = str(PurePosixPath(path))
    if safe_path != path or safe_path.startswith("/") or ".." in PurePosixPath(path).parts:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(f"{settings.supabase_url}/storage/v1/object/sign/profile-images/{safe_path}", headers={"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}", "Content-Type": "application/json"}, json={"expiresIn": 3600})
        if response.status_code != 200:
            return None
        signed = response.json().get("signedURL")
        if not isinstance(signed, str):
            return None
        if signed.startswith("http"):
            return signed
        return f"{settings.supabase_url}/storage/v1{signed if signed.startswith('/') else '/' + signed}"
    except (httpx.RequestError, ValueError):
        return None