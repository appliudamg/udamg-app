"""UDAMG APP — API (Supabase). Auth, gestion des utilisateurs, Messagerie, Media, Événements."""
from contextlib import asynccontextmanager
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from core import (
    ADMIN_EMAIL, ADMIN_PASSWORD, DUMMY_HASH, ROLE_ADMIN, ROLE_MEMBRE, ROLE_PASTEUR, ROLE_TECH, ROLES,
    USER_ADMIN_ROLES, PublicUser, TokenResponse, create_token, current_user, logger, new_id, now_iso,
    password_hash, public_user, require_role, sb,
)
import events
import media
import messaging
import push
import stories
from mailer import send_credentials_email

RoleLiteral = Literal["admin", "equipe_technique", "pasteur", "missionnaire", "berger",
                      "leader", "ouvrier", "disciple", "membre"]


# --------------------------------------------------------------------------- #
# Modèles
# --------------------------------------------------------------------------- #
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserCreate(BaseModel):
    email: EmailStr
    nom: str = Field(min_length=1, max_length=80)
    prenom: str = Field(min_length=1, max_length=80)
    role: RoleLiteral
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)


class UserUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: Optional[RoleLiteral] = None
    is_approved: Optional[bool] = None
    disabled: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)


class UserSaved(PublicUser):
    email_sent: bool = False
    email_error: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


# --------------------------------------------------------------------------- #
# Seed (idempotent)
# --------------------------------------------------------------------------- #
SEED_ACCOUNTS = [
    (ADMIN_EMAIL, ROLE_ADMIN, "UDAMG", "Admin", ADMIN_PASSWORD),
    ("technique@udamg.app", ROLE_TECH, "UDAMG", "Équipe Technique", "TechUdamg2026!"),
    ("pasteur@udamg.app", ROLE_PASTEUR, "UDAMG", "Pasteur", "PasteurUdamg2026!"),
    ("membre@udamg.app", ROLE_MEMBRE, "Bernard", "Luc", "MembreUdamg2026!"),
]


def seed():
    existing = {u["email"]: u for u in sb().table("users").select("id,email,role").execute().data}
    for email, role, nom, prenom, pw in SEED_ACCOUNTS:
        if email in existing:
            if existing[email]["role"] != role:
                sb().table("users").update({"role": role, "disabled": False, "is_approved": True}).eq("email", email).execute()
            continue
        sb().table("users").insert({
            "id": new_id(), "email": email, "nom": nom, "prenom": prenom, "role": role,
            "password_hash": password_hash.hash(pw), "is_approved": True, "disabled": False, "created_at": now_iso(),
        }).execute()
        logger.info("Compte créé : %s (%s)", email, role)
    events.seed_villes()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        seed()
    except Exception as e:  # ne bloque pas le démarrage si Supabase est momentanément indisponible
        logger.error("Seed impossible : %s", e)
    yield


app = FastAPI(title="UDAMG API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
api = APIRouter(prefix="/api")


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
@api.get("/")
def root():
    return {"app": "UDAMG API", "slogan": "Sauvé par Grâce pour Sauver", "backend": "supabase"}


@api.get("/roles")
def list_roles():
    return {"roles": ROLES}


@api.post("/auth/login", response_model=TokenResponse)
def login(data: Credentials):
    email = data.email.strip().lower()
    res = sb().table("users").select("*").eq("email", email).limit(1).execute()
    u = res.data[0] if res.data else None
    ok = password_hash.verify(data.password, u["password_hash"] if u else DUMMY_HASH)
    if not u or not ok or u.get("disabled"):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    if not u.get("is_approved", True):
        raise HTTPException(403, detail={"code": "email_not_approved", "email": email,
                                         "message": "Votre compte n'a pas encore été approuvé par un administrateur."})
    return TokenResponse(access_token=create_token(u), user=public_user(u))


@api.post("/auth/register", status_code=403)
def register(data: Credentials):
    raise HTTPException(403, detail={"code": "registration_disabled", "email": data.email.strip().lower(),
                                     "message": "L'inscription publique est désactivée. Contactez un administrateur UDAMG."})


@api.get("/auth/me", response_model=PublicUser)
def me(user=Depends(current_user)):
    return public_user(user)


@api.post("/auth/password")
def change_password(data: PasswordChange, user=Depends(current_user)):
    if not password_hash.verify(data.current_password, user["password_hash"]):
        raise HTTPException(400, "Mot de passe actuel incorrect")
    sb().table("users").update({"password_hash": password_hash.hash(data.new_password)}).eq("id", user["id"]).execute()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Admin — utilisateurs
# --------------------------------------------------------------------------- #
admin_dep = require_role(*USER_ADMIN_ROLES)


@api.get("/admin/users", response_model=List[PublicUser])
def admin_list_users(_=Depends(admin_dep)):
    rows = sb().table("users").select("*").order("created_at", desc=True).execute().data
    return [public_user(u) for u in rows]


@api.post("/admin/users", response_model=UserSaved, status_code=201)
def admin_create_user(data: UserCreate, _=Depends(admin_dep)):
    email = data.email.strip().lower()
    if sb().table("users").select("id").eq("email", email).execute().data:
        raise HTTPException(409, "Un compte avec cet email existe déjà")
    row = {
        "id": new_id(), "email": email, "nom": data.nom.strip(), "prenom": data.prenom.strip(),
        "role": data.role, "password_hash": password_hash.hash(data.password or new_id()),
        "is_approved": True, "disabled": False, "created_at": now_iso(),
    }
    created = sb().table("users").insert(row).execute().data[0]
    sent, err = send_credentials_email(created, data.password) if data.password else (False, "Aucun mot de passe fourni")
    return UserSaved(**public_user(created).model_dump(), email_sent=sent, email_error=err)


@api.patch("/admin/users/{uid}", response_model=UserSaved)
def admin_update_user(uid: str, data: UserUpdate, actor=Depends(admin_dep)):
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if uid == actor["id"]:
        if updates.get("role") not in (None, ROLE_ADMIN):
            raise HTTPException(400, "Vous ne pouvez pas retirer votre propre rôle Admin")
        if updates.get("disabled"):
            raise HTTPException(400, "Vous ne pouvez pas désactiver votre propre compte")
    new_password = updates.pop("password", None)
    if new_password:
        updates["password_hash"] = password_hash.hash(new_password)
    if not updates:
        raise HTTPException(400, "Aucune modification")
    res = sb().table("users").update(updates).eq("id", uid).execute()
    if not res.data:
        raise HTTPException(404, "Utilisateur introuvable")
    sent, err = send_credentials_email(res.data[0], new_password, reset=True) if new_password else (False, None)
    return UserSaved(**public_user(res.data[0]).model_dump(), email_sent=sent, email_error=err)


@api.delete("/admin/users/{uid}", status_code=204)
def admin_delete_user(uid: str, actor=Depends(admin_dep)):
    if uid == actor["id"]:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte")
    res = sb().table("users").delete().eq("id", uid).execute()
    if not res.data:
        raise HTTPException(404, "Utilisateur introuvable")
    return None


app.include_router(api)
app.include_router(media.router)
app.include_router(messaging.router)
app.include_router(events.router)
app.include_router(push.router)
app.include_router(stories.router)
