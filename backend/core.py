"""UDAMG API — configuration, Supabase client, auth helpers & roles."""
import os
import logging
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Optional
from uuid import uuid4

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr
from supabase import Client, create_client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ISSUER = os.getenv("JWT_ISSUER", "udamg-api")
JWT_ALGORITHM = "HS256"
JWT_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@udamg.app").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "AdminUdamg2026!")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("udamg")

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("not-a-real-password-000")
bearer = HTTPBearer(auto_error=False)

# --------------------------------------------------------------------------- #
# Supabase
# --------------------------------------------------------------------------- #
# Le client synchrone (httpx) n'est pas thread-safe : une instance par thread.
_local = threading.local()


def sb() -> Client:
    client = getattr(_local, "client", None)
    if client is None:
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        _local.client = client
    return client


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


# --------------------------------------------------------------------------- #
# Rôles
# --------------------------------------------------------------------------- #
ROLE_ADMIN = "admin"
ROLE_TECH = "equipe_technique"
ROLE_PASTEUR = "pasteur"
ROLE_MISSIONNAIRE = "missionnaire"
ROLE_BERGER = "berger"
ROLE_LEADER = "leader"
ROLE_OUVRIER = "ouvrier"
ROLE_DISCIPLE = "disciple"
ROLE_MEMBRE = "membre"

ROLES = [ROLE_ADMIN, ROLE_TECH, ROLE_PASTEUR, ROLE_MISSIONNAIRE, ROLE_BERGER,
         ROLE_LEADER, ROLE_OUVRIER, ROLE_DISCIPLE, ROLE_MEMBRE]

# Media : écriture réservée à l'Équipe technique
MEDIA_WRITE_ROLES = {ROLE_TECH}
# Media : lecture complète (y compris Réunion Pasteur / Conseil élargi)
MEDIA_FULL_READ_ROLES = {ROLE_ADMIN, ROLE_TECH, ROLE_PASTEUR, ROLE_MISSIONNAIRE, ROLE_BERGER}
RESTRICTED_SUBCATEGORIES = {"Réunion Pasteur", "Conseil élargi"}
# Messagerie : émetteurs
MESSAGE_SEND_ROLES = {ROLE_ADMIN, ROLE_TECH}
# Utilisateurs : gestion
USER_ADMIN_ROLES = {ROLE_ADMIN}
# Événements : gestion (création, inscrits, séances, pointage) / administration (suppression, purge)
EVENT_MANAGE_ROLES = {ROLE_ADMIN, ROLE_TECH, ROLE_PASTEUR, ROLE_MISSIONNAIRE, ROLE_BERGER}
EVENT_ADMIN_ROLES = {ROLE_ADMIN, ROLE_PASTEUR}


def can_read_restricted_media(user: dict) -> bool:
    return user["role"] in MEDIA_FULL_READ_ROLES


# --------------------------------------------------------------------------- #
# Modèles communs
# --------------------------------------------------------------------------- #
class PublicUser(BaseModel):
    id: str
    email: EmailStr
    nom: str
    prenom: str
    role: str
    is_approved: bool = True
    disabled: bool = False
    created_at: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PublicUser


def public_user(u: dict) -> PublicUser:
    return PublicUser(
        id=u["id"], email=u["email"], nom=u.get("nom", ""), prenom=u.get("prenom", ""),
        role=u["role"], is_approved=u.get("is_approved", True),
        disabled=u.get("disabled", False), created_at=u.get("created_at"),
    )


def create_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"], "role": user["role"], "iss": JWT_ISSUER,
        "iat": now, "exp": now + timedelta(minutes=JWT_MINUTES), "jti": str(uuid4()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], issuer=JWT_ISSUER,
                          options={"require": ["sub", "exp", "iss", "jti"]})
    except InvalidTokenError:
        return None


def load_user(uid: str) -> Optional[dict]:
    res = sb().table("users").select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else None


def user_from_token(token: str) -> dict:
    unauthorized = HTTPException(401, "Token invalide ou expiré", headers={"WWW-Authenticate": "Bearer"})
    payload = decode_token(token)
    if not payload:
        raise unauthorized
    user = load_user(payload["sub"])
    if not user or user.get("disabled"):
        raise unauthorized
    if not user.get("is_approved", True):
        raise HTTPException(403, "Compte en attente d'approbation")
    return user


def current_user(credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Token invalide ou expiré", headers={"WWW-Authenticate": "Bearer"})
    return user_from_token(credentials.credentials)


def require_role(*roles: str):
    def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Permission insuffisante")
        return user
    return dep


def display_name(user: dict) -> str:
    return f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or user["email"]
