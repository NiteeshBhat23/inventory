"""Verifies the Supabase-issued JWT on every request and resolves shop_id
from it. shop_id is NEVER trusted from the request body/query (System Design
doc, Authorization section).

Verification uses Supabase's public JWKS endpoint (asymmetric ES256/RS256),
which is what Supabase's newer "JWT Signing Keys" projects issue tokens with
— a static shared-secret (legacy HS256) check would reject valid tokens on
those projects. jwt.PyJWKClient caches the keyset and re-fetches automatically
when a token references a key id it hasn't seen yet (e.g. after key rotation).
"""

import uuid
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import get_settings

bearer_scheme = HTTPBearer()


@lru_cache
def _jwk_client() -> PyJWKClient:
    settings = get_settings()
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url, cache_keys=True)


def get_current_shop_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> uuid.UUID:
    token = credentials.credentials
    try:
        signing_key = _jwk_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")

    try:
        return uuid.UUID(sub)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject claim")
