"""UDAMG APP backend - Evangelization & Church life management."""
import os
import io
import logging
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, List, Optional, Literal
from uuid import uuid4

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, APIRouter, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field
from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ISSUER = os.getenv("JWT_ISSUER", "udamg-api")
JWT_ALGORITHM = "HS256"
JWT_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].strip().lower()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("not-a-real-password-000")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("udamg")

ROLE_PASTEUR = "pasteur"
ROLE_OUVRIER = "ouvrier"
ROLE_EVANGELISTE = "evangeliste"
ROLES = {ROLE_PASTEUR, ROLE_OUVRIER, ROLE_EVANGELISTE}

CATEGORIES = ["Mission JAC", "GÉDÉON", "CCMG"]

# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class RegisterInput(Credentials):
    nom: str = Field(min_length=1, max_length=80)
    prenom: str = Field(min_length=1, max_length=80)


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    nom: str
    prenom: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PublicUser


class Ville(BaseModel):
    id: str
    nom: str          # "CCMG Paris"
    code_postal: str
    pays: str = "France"
    whatsapp_link: Optional[str] = None


class Programme(BaseModel):
    id: str
    nom: str          # "Convention EBED 2026"
    description: Optional[str] = None
    code_acces: Optional[str] = None
    is_ebed: bool = False


class ContactIn(BaseModel):
    nom: str
    prenom: str
    tel: Optional[str] = None
    categorie: str
    referent: Optional[str] = None
    niveau: int = Field(default=1, ge=1, le=4)
    notes: Optional[str] = None
    context_type: Literal["ville", "programme"]
    context_id: str


class ContactUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    tel: Optional[str] = None
    categorie: Optional[str] = None
    referent: Optional[str] = None
    niveau: Optional[int] = Field(default=None, ge=1, le=4)
    notes: Optional[str] = None


class Contact(BaseModel):
    id: str
    nom: str
    prenom: str
    tel: Optional[str] = None
    categorie: str
    referent: str
    niveau: int
    notes: Optional[str] = None
    date_ajout: str
    context_type: str
    context_id: str
    context_nom: Optional[str] = None
    enregistre_par: str
    created_at: datetime


class RelanceInput(BaseModel):
    niveau: int = Field(ge=1, le=4)


class TransfertInput(BaseModel):
    contact_id: str
    ville_dest_id: str


class Evenement(BaseModel):
    id: str
    titre: str
    description: Optional[str] = None
    date: datetime
    lieu: str
    ville: Optional[str] = None
    type_evenement: str
    intervenants: List[str] = []
    image_url: Optional[str] = None
    created_by: str
    created_at: datetime


class EvenementCreate(BaseModel):
    titre: str
    description: Optional[str] = None
    date: datetime
    lieu: str
    ville: Optional[str] = None
    type_evenement: str
    intervenants: List[str] = []
    image_url: Optional[str] = None


class InvitationCreate(BaseModel):
    evenement_id: str
    user_ids: List[str]
    special: bool = False


# --------------------------------------------------------------------------- #
# Utils
# --------------------------------------------------------------------------- #
def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def contact_from_doc(d: dict) -> Contact:
    return Contact(
        id=d["_id"], nom=d["nom"], prenom=d["prenom"], tel=d.get("tel"),
        categorie=d["categorie"], referent=d.get("referent", ""),
        niveau=d.get("niveau", 1), notes=d.get("notes"),
        date_ajout=d.get("date_ajout", ""),
        context_type=d["context_type"], context_id=d["context_id"],
        context_nom=d.get("context_nom"),
        enregistre_par=d.get("enregistre_par", ""),
        created_at=d.get("created_at", datetime.now(timezone.utc)),
    )


# --------------------------------------------------------------------------- #
# App + DB lifespan
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncIOMotorClient(MONGO_URL)
    app.state.client = client
    app.state.db = client[DB_NAME]
    db = app.state.db
    await db.users.create_index("email", unique=True)
    await db.villes.create_index("nom")
    await db.programmes.create_index("nom")
    await db.contacts.create_index([("context_type", 1), ("context_id", 1)])
    await db.contacts.create_index("enregistre_par")
    await db.anciens.create_index([("context_type", 1), ("context_id", 1)])
    await db.transferts.create_index("timestamp")
    await db.evenements.create_index("date")
    await db.invitations.create_index([("evenement_id", 1), ("user_id", 1)], unique=True)
    # Event portal collections
    await db.event_participants.create_index([("evenement_id", 1), ("badge_id", 1)], unique=True)
    await db.event_participants.create_index([("evenement_id", 1), ("nom", 1)])
    await db.event_sessions.create_index("evenement_id")
    await db.event_pointages.create_index([("evenement_id", 1), ("participant_id", 1), ("session_id", 1)], unique=True)
    await db.event_pointages.create_index("timestamp")
    await db.event_enfants.create_index([("evenement_id", 1), ("session_id", 1)])
    # Pôle 3 — media indexes
    await db.media_items.create_index([("category", 1), ("created_at", -1)])
    await db.media_items.create_index([("title", "text"), ("author", "text"), ("description", "text")])
    await db.playlists.create_index([("user_id", 1), ("updated_at", -1)])
    await db.favorites.create_index([("user_id", 1), ("media_id", 1)], unique=True)
    await db.user_progress.create_index([("user_id", 1), ("media_id", 1)], unique=True)
    await _seed(db)
    from media import seed_media, init_storage_async
    await seed_media(db)
    await init_storage_async()
    yield
    client.close()


app = FastAPI(title="UDAMG API", lifespan=lifespan)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
def public_user(u: dict) -> PublicUser:
    return PublicUser(id=u["_id"], email=u["email"], nom=u.get("nom", ""),
                      prenom=u.get("prenom", ""), role=u["role"])


def create_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["_id"], "role": user["role"], "iss": JWT_ISSUER,
        "iat": now, "exp": now + timedelta(minutes=JWT_MINUTES), "jti": str(uuid4()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
) -> dict:
    unauthorized = HTTPException(401, "Token invalide ou expiré", headers={"WWW-Authenticate": "Bearer"})
    if not credentials or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET,
                             algorithms=[JWT_ALGORITHM], issuer=JWT_ISSUER,
                             options={"require": ["sub", "exp", "iss", "jti"]})
    except InvalidTokenError:
        raise unauthorized
    user = await app.state.db.users.find_one({"_id": payload["sub"], "disabled": False})
    if not user:
        raise unauthorized
    return user


def require_role(*roles: str):
    async def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Permission insuffisante")
        return user
    return dep


def can_see_all(user: dict) -> bool:
    return user["role"] in (ROLE_PASTEUR, ROLE_OUVRIER)


# --------------------------------------------------------------------------- #
# Seed data
# --------------------------------------------------------------------------- #
async def _seed(db):
    # Pasteur admin
    if not await db.users.find_one({"email": ADMIN_EMAIL}):
        await db.users.insert_one({
            "_id": str(uuid4()), "email": ADMIN_EMAIL, "nom": "UDAMG", "prenom": "Pasteur",
            "password_hash": password_hash.hash(ADMIN_PASSWORD),
            "role": ROLE_PASTEUR, "disabled": False, "created_at": datetime.now(timezone.utc),
        })
        logger.info("Pasteur seeded: %s", ADMIN_EMAIL)
    else:
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"role": ROLE_PASTEUR, "disabled": False}})

    # Ouvrier + Evangéliste demo
    for email, role, nom, prenom, pw in [
        ("ouvrier@udamg.app", ROLE_OUVRIER, "Martin", "Sophie", "OuvrierUdamg2026!"),
        ("evangeliste@udamg.app", ROLE_EVANGELISTE, "Dupont", "Jean", "EvangUdamg2026!"),
        ("membre@udamg.app", ROLE_EVANGELISTE, "Bernard", "Luc", "MembreUdamg2026!"),
    ]:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "_id": str(uuid4()), "email": email, "nom": nom, "prenom": prenom,
                "password_hash": password_hash.hash(pw), "role": role,
                "disabled": False, "created_at": datetime.now(timezone.utc),
            })

    # Églises officielles CCMG (15)
    OFFICIAL_CCMG = [
        "CCMG Angers", "CCMG Brest", "CCMG Châteaubriant", "CCMG La Roche sur Yon",
        "CCMG La Rochelle", "CCMG Le Mans", "CCMG Morlaix", "CCMG Nantes",
        "CCMG Paris", "CCMG Quimper", "CCMG Rennes", "CCMG Saint-Nazaire",
        "CCMG Saumur", "CCMG Tours", "CCMG Vannes - Redon",
    ]
    existing_villes = {v["nom"]: v for v in await db.villes.find({}).to_list(500)}
    for nom in OFFICIAL_CCMG:
        if nom not in existing_villes:
            await db.villes.insert_one({
                "_id": str(uuid4()), "nom": nom, "code_postal": "", "pays": "France",
                "whatsapp_link": None,
            })

    # Programmes (sans obligation de code)
    if await db.programmes.count_documents({}) == 0:
        await db.programmes.insert_many([
            {"_id": str(uuid4()), "nom": "Convention EBED 2026", "description": "Grande convention nationale", "code_acces": None, "is_ebed": True},
            {"_id": str(uuid4()), "nom": "Retraite Spirituelle", "description": "Retraite annuelle", "code_acces": None, "is_ebed": False},
        ])

    # Événements
    if await db.evenements.count_documents({}) == 0:
        admin = await db.users.find_one({"email": ADMIN_EMAIL})
        now = datetime.now(timezone.utc)
        await db.evenements.insert_many([
            {"_id": str(uuid4()), "titre": "Sortie d'évangélisation - Centre-ville", "description": "Grande mobilisation", "date": now + timedelta(days=3), "lieu": "Place du Ralliement", "ville": "Angers", "type_evenement": "sortie_evangelisation", "intervenants": ["Pasteur Marc"], "image_url": None, "created_by": admin["_id"], "created_at": now},
            {"_id": str(uuid4()), "titre": "Veillée de prière", "description": "Nuit d'adoration", "date": now + timedelta(days=7), "lieu": "Église centrale", "ville": "Angers", "type_evenement": "veillee", "intervenants": ["Pasteur Marc"], "image_url": None, "created_by": admin["_id"], "created_at": now},
            {"_id": str(uuid4()), "titre": "Culte spécial - Anciens", "description": "Culte de bénédiction", "date": now + timedelta(days=14), "lieu": "Grande salle", "ville": "Angers", "type_evenement": "culte_special", "intervenants": ["Pasteur Jean"], "image_url": None, "created_by": admin["_id"], "created_at": now},
            {"_id": str(uuid4()), "titre": "Réunion des jeunes", "description": "Rencontre mensuelle", "date": now + timedelta(days=10), "lieu": "Salle Jeunesse", "ville": "Angers", "type_evenement": "reunion_jeunes", "intervenants": ["Sœur Claire"], "image_url": None, "created_by": admin["_id"], "created_at": now},
        ])

    # Cleanup TEST_ events (from automated tests)
    test_events = await db.evenements.find({"titre": {"$regex": "^TEST_"}}).to_list(500)
    for te in test_events:
        eid = te["_id"]
        await db.event_participants.delete_many({"evenement_id": eid})
        await db.event_sessions.delete_many({"evenement_id": eid})
        await db.event_pointages.delete_many({"evenement_id": eid})
        await db.event_enfants.delete_many({"evenement_id": eid})
        await db.evenements.delete_one({"_id": eid})


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@api.get("/")
async def root():
    return {"app": "UDAMG API", "slogan": "Sauvé par Grâce pour Sauver"}


# ---- Auth
@api.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterInput):
    email = data.email.strip().lower()
    user = {
        "_id": str(uuid4()), "email": email, "nom": data.nom.strip(), "prenom": data.prenom.strip(),
        "password_hash": password_hash.hash(data.password), "role": ROLE_EVANGELISTE,
        "disabled": False, "created_at": datetime.now(timezone.utc),
    }
    try:
        await app.state.db.users.insert_one(user)
    except Exception:
        raise HTTPException(409, "Email déjà utilisé")
    return TokenResponse(access_token=create_token(user), user=public_user(user))


@api.post("/auth/login", response_model=TokenResponse)
async def login(data: Credentials):
    email = data.email.strip().lower()
    u = await app.state.db.users.find_one({"email": email, "disabled": False})
    stored = u["password_hash"] if u else DUMMY_HASH
    ok = password_hash.verify(data.password, stored)
    if not u or not ok:
        raise HTTPException(401, "Email ou mot de passe incorrect")
    return TokenResponse(access_token=create_token(u), user=public_user(u))


@api.get("/auth/me", response_model=PublicUser)
async def me(user=Depends(current_user)):
    return public_user(user)


# ---- Villes (Églises)
@api.get("/villes", response_model=List[Ville])
async def list_villes(_=Depends(current_user)):
    docs = await app.state.db.villes.find({}).sort("nom", 1).to_list(500)
    return [Ville(id=d["_id"], nom=d["nom"], code_postal=d["code_postal"], pays=d.get("pays", "France"), whatsapp_link=d.get("whatsapp_link")) for d in docs]


class VilleIn(BaseModel):
    nom: str
    code_postal: str = ""
    pays: str = "France"
    whatsapp_link: Optional[str] = None


@api.post("/villes", response_model=Ville, status_code=201)
async def create_ville(data: VilleIn, _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    doc = {"_id": str(uuid4()), "nom": data.nom.strip(), "code_postal": data.code_postal,
           "pays": data.pays, "whatsapp_link": data.whatsapp_link}
    await app.state.db.villes.insert_one(doc)
    return Ville(id=doc["_id"], nom=doc["nom"], code_postal=doc["code_postal"], pays=doc["pays"], whatsapp_link=doc.get("whatsapp_link"))


@api.delete("/villes/{vid}", status_code=204)
async def delete_ville(vid: str, _=Depends(require_role(ROLE_PASTEUR))):
    res = await app.state.db.villes.delete_one({"_id": vid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Église introuvable")
    return None


class ProgrammeIn(BaseModel):
    nom: str
    description: Optional[str] = None
    is_ebed: bool = False


@api.post("/programmes", response_model=Programme, status_code=201)
async def create_programme(data: ProgrammeIn, _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    doc = {"_id": str(uuid4()), "nom": data.nom.strip(), "description": data.description,
           "code_acces": None, "is_ebed": data.is_ebed}
    await app.state.db.programmes.insert_one(doc)
    return Programme(id=doc["_id"], nom=doc["nom"], description=doc.get("description"),
                     code_acces=None, is_ebed=doc["is_ebed"])


@api.delete("/programmes/{pid}", status_code=204)
async def delete_programme(pid: str, _=Depends(require_role(ROLE_PASTEUR))):
    res = await app.state.db.programmes.delete_one({"_id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Programme introuvable")
    return None


@api.delete("/anciens/{aid}", status_code=204)
async def delete_ancien(aid: str, _=Depends(require_role(ROLE_PASTEUR))):
    res = await app.state.db.anciens.delete_one({"_id": aid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Ancien introuvable")
    return None


# ---- Programmes
@api.get("/programmes", response_model=List[Programme])
async def list_programmes(_=Depends(current_user)):
    docs = await app.state.db.programmes.find({}).sort("nom", 1).to_list(500)
    return [Programme(id=d["_id"], nom=d["nom"], description=d.get("description"), code_acces=d.get("code_acces"), is_ebed=d.get("is_ebed", False)) for d in docs]


@api.post("/programmes/{prog_id}/access")
async def verify_programme_access(prog_id: str, body: dict, _=Depends(current_user)):
    p = await app.state.db.programmes.find_one({"_id": prog_id})
    if not p:
        raise HTTPException(404, "Programme introuvable")
    if (body.get("code") or "").strip().upper() != (p.get("code_acces") or "").upper():
        raise HTTPException(401, "Code d'accès incorrect")
    return {"ok": True}


# ---- Contacts (âmes)
@api.get("/contacts", response_model=List[Contact])
async def list_contacts(
    context_type: str, context_id: str, categorie: Optional[str] = None,
    user=Depends(current_user),
):
    if context_type not in ("ville", "programme", "GLOBAL"):
        raise HTTPException(400, "context_type invalide")
    query: dict = {}
    if context_type == "GLOBAL":
        if not can_see_all(user):
            raise HTTPException(403, "Vue globale réservée aux pasteurs")
    else:
        query["context_type"] = context_type
        query["context_id"] = context_id
    if categorie:
        query["categorie"] = categorie
    if not can_see_all(user):
        query["enregistre_par"] = user["email"]
    docs = await app.state.db.contacts.find(query).sort("nom", 1).to_list(2000)
    return [contact_from_doc(d) for d in docs]


@api.post("/contacts", response_model=Contact, status_code=201)
async def create_contact(data: ContactIn, user=Depends(current_user)):
    if data.categorie not in CATEGORIES:
        raise HTTPException(400, f"Catégorie invalide (attendues: {CATEGORIES})")
    # Resolve context name
    context_nom = None
    if data.context_type == "ville":
        v = await app.state.db.villes.find_one({"_id": data.context_id})
        if not v: raise HTTPException(404, "Église introuvable")
        context_nom = v["nom"]
    else:
        p = await app.state.db.programmes.find_one({"_id": data.context_id})
        if not p: raise HTTPException(404, "Programme introuvable")
        context_nom = p["nom"]
    now = datetime.now(timezone.utc)
    doc = {
        "_id": str(uuid4()),
        "nom": data.nom.strip().upper(),
        "prenom": data.prenom.strip(),
        "tel": data.tel,
        "categorie": data.categorie,
        "referent": (data.referent or "").strip() or f"{user['prenom']} {user['nom']}".strip(),
        "niveau": data.niveau,
        "notes": data.notes,
        "date_ajout": now.strftime("%d/%m/%Y"),
        "context_type": data.context_type,
        "context_id": data.context_id,
        "context_nom": context_nom,
        "enregistre_par": user["email"],
        "created_at": now,
    }
    await app.state.db.contacts.insert_one(doc)
    return contact_from_doc(doc)


@api.patch("/contacts/{cid}", response_model=Contact)
async def update_contact(cid: str, data: ContactUpdate, user=Depends(current_user)):
    existing = await app.state.db.contacts.find_one({"_id": cid})
    if not existing:
        raise HTTPException(404, "Contact introuvable")
    if not can_see_all(user) and existing.get("enregistre_par") != user["email"]:
        raise HTTPException(403, "Modification non autorisée")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "nom" in updates:
        updates["nom"] = updates["nom"].strip().upper()
    if "categorie" in updates and updates["categorie"] not in CATEGORIES:
        raise HTTPException(400, "Catégorie invalide")
    await app.state.db.contacts.update_one({"_id": cid}, {"$set": updates})
    fresh = await app.state.db.contacts.find_one({"_id": cid})
    return contact_from_doc(fresh)


@api.post("/contacts/{cid}/relance", response_model=Contact)
async def relance_contact(cid: str, data: RelanceInput, user=Depends(current_user)):
    existing = await app.state.db.contacts.find_one({"_id": cid})
    if not existing:
        raise HTTPException(404, "Contact introuvable")
    if not can_see_all(user) and existing.get("enregistre_par") != user["email"]:
        raise HTTPException(403, "Relance non autorisée")
    await app.state.db.contacts.update_one({"_id": cid}, {"$set": {"niveau": data.niveau}})
    fresh = await app.state.db.contacts.find_one({"_id": cid})
    return contact_from_doc(fresh)


@api.post("/contacts/{cid}/archive")
async def archive_contact(cid: str, user=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    doc = await app.state.db.contacts.find_one({"_id": cid})
    if not doc:
        raise HTTPException(404, "Contact introuvable")
    doc["archived_at"] = datetime.now(timezone.utc)
    doc["archived_by"] = user["email"]
    await app.state.db.anciens.insert_one(doc)
    await app.state.db.contacts.delete_one({"_id": cid})
    return {"ok": True}


@api.post("/contacts/transfer")
async def transfer_contact(data: TransfertInput, user=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    doc = await app.state.db.contacts.find_one({"_id": data.contact_id})
    if not doc:
        raise HTTPException(404, "Contact introuvable")
    dest = await app.state.db.villes.find_one({"_id": data.ville_dest_id})
    if not dest:
        raise HTTPException(404, "Église de destination introuvable")
    old_ctx = {"type": doc["context_type"], "id": doc["context_id"], "nom": doc.get("context_nom")}
    doc["context_type"] = "ville"
    doc["context_id"] = data.ville_dest_id
    doc["context_nom"] = dest["nom"]
    await app.state.db.contacts.update_one(
        {"_id": data.contact_id},
        {"$set": {"context_type": "ville", "context_id": data.ville_dest_id, "context_nom": dest["nom"]}},
    )
    await app.state.db.transferts.insert_one({
        "_id": str(uuid4()),
        "contact_id": data.contact_id,
        "contact_nom": f"{doc['prenom']} {doc['nom']}",
        "from": old_ctx,
        "to": {"type": "ville", "id": data.ville_dest_id, "nom": dest["nom"]},
        "by": user["email"],
        "timestamp": datetime.now(timezone.utc),
    })
    return {"ok": True}


@api.delete("/contacts/{cid}", status_code=204)
async def delete_contact(cid: str, user=Depends(require_role(ROLE_PASTEUR))):
    r = await app.state.db.contacts.delete_one({"_id": cid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Contact introuvable")
    return None


# ---- Anciens
@api.get("/anciens", response_model=List[Contact])
async def list_anciens(context_type: str, context_id: str, user=Depends(current_user)):
    query = {"context_type": context_type, "context_id": context_id} if context_type != "GLOBAL" else {}
    if not can_see_all(user):
        query["enregistre_par"] = user["email"]
    docs = await app.state.db.anciens.find(query).sort("nom", 1).to_list(2000)
    return [contact_from_doc(d) for d in docs]


# ---- Stats
@api.get("/contacts/stats")
async def contacts_stats(context_type: str, context_id: str, user=Depends(current_user)):
    query: dict = {}
    if context_type != "GLOBAL":
        query["context_type"] = context_type
        query["context_id"] = context_id
    if not can_see_all(user):
        query["enregistre_par"] = user["email"]
    docs = await app.state.db.contacts.find(query).to_list(5000)
    total = len(docs)
    by_niveau = {1: 0, 2: 0, 3: 0, 4: 0}
    by_categorie: dict = {c: 0 for c in CATEGORIES}
    for d in docs:
        by_niveau[d.get("niveau", 1)] = by_niveau.get(d.get("niveau", 1), 0) + 1
        by_categorie[d.get("categorie", "")] = by_categorie.get(d.get("categorie", ""), 0) + 1
    return {
        "total": total,
        "niveau_1_relances": by_niveau.get(1, 0),
        "niveau_2_presentes": by_niveau.get(2, 0),
        "niveau_3_invites": by_niveau.get(3, 0),
        "niveau_4_disciples": by_niveau.get(4, 0),
        "by_categorie": by_categorie,
        "by_week": _weekly_breakdown(docs),
    }


def _weekly_breakdown(docs: list) -> list:
    """Return last 8 ISO weeks with contact counts."""
    from collections import Counter
    weeks = Counter()
    for d in docs:
        dt = d.get("created_at")
        if not dt: continue
        iso = dt.isocalendar()
        key = f"{iso[0]}-S{iso[1]:02d}"
        weeks[key] += 1
    now = datetime.now(timezone.utc)
    keys = []
    for i in range(7, -1, -1):
        d = now - timedelta(weeks=i)
        iso = d.isocalendar()
        keys.append(f"{iso[0]}-S{iso[1]:02d}")
    return [{"semaine": k, "count": weeks.get(k, 0)} for k in keys]


# ---- Événements (unchanged core)
def event_from_doc(d: dict) -> Evenement:
    return Evenement(
        id=d["_id"], titre=d["titre"], description=d.get("description"),
        date=d["date"], lieu=d["lieu"], ville=d.get("ville"),
        type_evenement=d["type_evenement"], intervenants=d.get("intervenants", []),
        image_url=d.get("image_url"), created_by=d.get("created_by", ""),
        created_at=d.get("created_at", datetime.now(timezone.utc)),
    )


@api.get("/evenements", response_model=List[Evenement])
async def list_evenements(_=Depends(current_user)):
    docs = await app.state.db.evenements.find({}).sort("date", 1).to_list(500)
    return [event_from_doc(d) for d in docs]


@api.get("/evenements/{eid}", response_model=Evenement)
async def get_evenement(eid: str, _=Depends(current_user)):
    d = await app.state.db.evenements.find_one({"_id": eid})
    if not d: raise HTTPException(404, "Événement introuvable")
    return event_from_doc(d)


@api.post("/evenements", response_model=Evenement, status_code=201)
async def create_evt(data: EvenementCreate, user=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    now = datetime.now(timezone.utc)
    doc = {"_id": str(uuid4()), **data.model_dump(), "created_by": user["_id"], "created_at": now}
    await app.state.db.evenements.insert_one(doc)
    return event_from_doc(doc)


@api.delete("/evenements/{eid}", status_code=204)
async def delete_evenement(eid: str, _=Depends(require_role(ROLE_PASTEUR))):
    db = app.state.db
    exists = await db.evenements.find_one({"_id": eid})
    if not exists:
        raise HTTPException(404, "Événement introuvable")
    # Cascade cleanup of all event-related collections
    await db.event_participants.delete_many({"evenement_id": eid})
    await db.event_sessions.delete_many({"evenement_id": eid})
    await db.event_pointages.delete_many({"evenement_id": eid})
    await db.event_enfants.delete_many({"evenement_id": eid})
    await db.invitations.delete_many({"evenement_id": eid})
    await db.evenements.delete_one({"_id": eid})
    return None


@api.get("/users", response_model=List[PublicUser])
async def list_users(_=Depends(current_user)):
    docs = await app.state.db.users.find({"disabled": False}, {"password_hash": 0}).to_list(1000)
    return [public_user(d) for d in docs]


@api.get("/evenements/{eid}/invitations")
async def list_invitations(eid: str, _=Depends(current_user)):
    docs = await app.state.db.invitations.find({"evenement_id": eid}).to_list(1000)
    return [{"id": d["_id"], "evenement_id": d["evenement_id"], "user_id": d["user_id"],
             "special": d.get("special", False), "status": d.get("status", "invited"),
             "created_at": d["created_at"]} for d in docs]


@api.post("/invitations", status_code=201)
async def invite(data: InvitationCreate, _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    now = datetime.now(timezone.utc)
    created = 0
    for uid in data.user_ids:
        try:
            await app.state.db.invitations.insert_one({
                "_id": str(uuid4()), "evenement_id": data.evenement_id, "user_id": uid,
                "special": data.special, "status": "invited", "created_at": now,
            })
            created += 1
        except Exception:
            continue
    return {"created": created, "total": len(data.user_ids)}


@api.get("/stats")
async def global_stats(user=Depends(current_user)):
    db = app.state.db
    q_contacts: dict = {} if can_see_all(user) else {"enregistre_par": user["email"]}
    return {
        "total_contacts": await db.contacts.count_documents(q_contacts),
        "total_evenements": await db.evenements.count_documents({}),
        "total_villes": await db.villes.count_documents({}),
        "total_programmes": await db.programmes.count_documents({}),
        "my_contacts": await db.contacts.count_documents({"enregistre_par": user["email"]}),
        "anciens": await db.anciens.count_documents(q_contacts),
        "transferts": await db.transferts.count_documents({}),
    }


# --------------------------------------------------------------------------- #
# Google Auth (Emergent-managed)
# --------------------------------------------------------------------------- #
class SessionExchange(BaseModel):
    session_id: str


@api.post("/auth/session", response_model=TokenResponse)
async def google_session(data: SessionExchange):
    """Exchange Emergent session_id → our own JWT. Upserts user by email."""
    if not data.session_id:
        raise HTTPException(400, "session_id manquant")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": data.session_id},
            )
    except Exception:
        raise HTTPException(401, "Impossible de vérifier la session Google")
    if r.status_code != 200:
        raise HTTPException(401, "Session Google invalide ou expirée")
    payload = r.json()
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Email absent de la réponse Google")
    full_name = (payload.get("name") or "").strip()
    parts = full_name.split(" ", 1)
    prenom = parts[0] if parts else "Utilisateur"
    nom = parts[1] if len(parts) > 1 else ""
    picture = payload.get("picture")

    existing = await app.state.db.users.find_one({"email": email})
    if existing:
        await app.state.db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {"google_id": payload.get("id"), "picture": picture, "disabled": False}},
        )
        user = await app.state.db.users.find_one({"_id": existing["_id"]})
    else:
        user = {
            "_id": str(uuid4()),
            "email": email,
            "nom": nom or "—",
            "prenom": prenom,
            "password_hash": password_hash.hash(uuid4().hex),  # unusable local pwd
            "role": ROLE_EVANGELISTE,
            "google_id": payload.get("id"),
            "picture": picture,
            "disabled": False,
            "created_at": datetime.now(timezone.utc),
        }
        await app.state.db.users.insert_one(user)
    return TokenResponse(access_token=create_token(user), user=public_user(user))


# --------------------------------------------------------------------------- #
# Transferts (journal)
# --------------------------------------------------------------------------- #
@api.get("/transferts")
async def list_transferts(q: Optional[str] = None, user=Depends(current_user)):
    query: dict = {}
    if not can_see_all(user):
        query["by"] = user["email"]
    docs = await app.state.db.transferts.find(query).sort("timestamp", -1).to_list(1000)
    if q:
        s = strip_accents(q)
        docs = [d for d in docs if s in strip_accents(
            f"{d.get('contact_nom','')} {d.get('from',{}).get('nom','')} {d.get('to',{}).get('nom','')} {d.get('by','')}"
        )]
    return [{
        "id": d["_id"],
        "contact_id": d.get("contact_id"),
        "contact_nom": d.get("contact_nom", ""),
        "from": d.get("from", {}),
        "to": d.get("to", {}),
        "by": d.get("by", ""),
        "timestamp": d["timestamp"],
    } for d in docs]


# --------------------------------------------------------------------------- #
# Rappels (contacts stagnants)
# --------------------------------------------------------------------------- #
@api.get("/rappels")
async def rappels(days: int = 7, user=Depends(current_user)):
    """Contacts at niveau 1 that haven't been touched for `days` days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query: dict = {"niveau": 1, "created_at": {"$lt": cutoff}}
    if not can_see_all(user):
        query["enregistre_par"] = user["email"]
    docs = await app.state.db.contacts.find(query).sort("created_at", 1).to_list(500)
    return [contact_from_doc(d).model_dump() for d in docs]


# --------------------------------------------------------------------------- #
# Exports (Excel / PDF)
# --------------------------------------------------------------------------- #
NIVEAU_LABEL = {1: "Relancé", 2: "Présenté", 3: "Invité", 4: "Disciple"}


async def _fetch_contacts(db, context_type: str, context_id: str, user: dict) -> list:
    query: dict = {}
    if context_type != "GLOBAL":
        query["context_type"] = context_type
        query["context_id"] = context_id
    if not can_see_all(user):
        query["enregistre_par"] = user["email"]
    return await db.contacts.find(query).sort([("categorie", 1), ("nom", 1)]).to_list(5000)


@api.get("/exports/contacts.xlsx")
async def export_xlsx(context_type: str, context_id: str, user=Depends(current_user)):
    docs = await _fetch_contacts(app.state.db, context_type, context_id, user)
    wb = Workbook()
    header_fill = PatternFill("solid", fgColor="0047AB")
    header_font = Font(bold=True, color="FFFFFF")
    # Summary sheet
    ws = wb.active
    ws.title = "Résumé"
    ws.append(["UDAMG - Rapport des Contacts"])
    ws.append([f"Contexte : {context_type} / {context_id}"])
    ws.append([f"Généré le : {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}"])
    ws.append([f"Total : {len(docs)}"])
    ws.append([])
    ws.append(["Catégorie", "Nombre"])
    for cat in CATEGORIES:
        ws.append([cat, sum(1 for d in docs if d.get("categorie") == cat)])
    ws.append([])
    ws.append(["Niveau", "Libellé", "Nombre"])
    for n in [1, 2, 3, 4]:
        ws.append([n, NIVEAU_LABEL[n], sum(1 for d in docs if d.get("niveau") == n)])
    # If GLOBAL, add per-eglise breakdown
    if context_type == "GLOBAL":
        ws.append([])
        ws.append(["Église", "Contacts"])
        egl: dict = {}
        for d in docs:
            key = d.get("context_nom") or d.get("context_id", "?")
            egl[key] = egl.get(key, 0) + 1
        for k, v in sorted(egl.items()):
            ws.append([k, v])
    # Per-category sheets (accent-safe sheet names)
    for cat in CATEGORIES:
        safe = strip_accents(cat).upper()[:31] or "CAT"
        s = wb.create_sheet(safe)
        headers = ["Nom", "Prénom", "Téléphone", "Niveau", "Libellé", "Référent", "Date ajout", "Église/Programme", "Notes"]
        s.append(headers)
        for i, h in enumerate(headers, 1):
            cell = s.cell(row=1, column=i)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        for d in [x for x in docs if x.get("categorie") == cat]:
            s.append([
                d.get("nom", ""),
                d.get("prenom", ""),
                d.get("tel", "") or "",
                d.get("niveau", 1),
                NIVEAU_LABEL.get(d.get("niveau", 1), ""),
                d.get("referent", ""),
                d.get("date_ajout", ""),
                d.get("context_nom", ""),
                d.get("notes", "") or "",
            ])
        # auto column width
        for col_idx, h in enumerate(headers, 1):
            s.column_dimensions[s.cell(row=1, column=col_idx).column_letter].width = max(14, len(h) + 2)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"UDAMG_contacts_{context_type}_{context_id}.xlsx"
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_pdf(docs: list, title: str, chunk_size: Optional[int] = None, hide_niveau: bool = False) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.2*cm, leftMargin=1.2*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph(f"<b>UDAMG</b> — {title}", styles["Title"]))
    story.append(Paragraph(f"Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')} · Total : {len(docs)}", styles["Normal"]))
    story.append(Spacer(1, 0.5*cm))

    if hide_niveau:
        headers = ["Nom", "Prénom", "Téléphone", "Catégorie", "Référent", "Date"]
        get_row = lambda d: [d.get("nom", ""), d.get("prenom", ""), d.get("tel", "") or "", d.get("categorie", ""), d.get("referent", ""), d.get("date_ajout", "")]
    else:
        headers = ["Nom", "Prénom", "Téléphone", "Cat.", "Niv.", "Référent", "Date"]
        get_row = lambda d: [d.get("nom", ""), d.get("prenom", ""), d.get("tel", "") or "", d.get("categorie", ""), str(d.get("niveau", 1)), d.get("referent", ""), d.get("date_ajout", "")]

    # sort alphabetically by nom
    docs_sorted = sorted(docs, key=lambda d: (d.get("nom", ""), d.get("prenom", "")))

    if chunk_size and chunk_size > 0:
        chunks = [docs_sorted[i:i+chunk_size] for i in range(0, len(docs_sorted), chunk_size)] or [[]]
    else:
        chunks = [docs_sorted]

    for idx, chunk in enumerate(chunks):
        data_rows = [headers] + [get_row(d) for d in chunk]
        table = Table(data_rows, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0047AB")),
            ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("BACKGROUND", (0, 1), (-1, -1), rl_colors.HexColor("#F8FAFC")),
            ("GRID", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CBD5E1")),
        ]))
        if chunk_size:
            story.append(Paragraph(f"<b>Lot {idx+1} / {len(chunks)}</b> — {len(chunk)} contact(s)", styles["Heading3"]))
            story.append(Spacer(1, 0.2*cm))
        story.append(table)
        if idx < len(chunks) - 1:
            story.append(PageBreak())

    doc.build(story)
    buf.seek(0)
    return buf.read()


@api.get("/exports/contacts.pdf")
async def export_pdf(context_type: str, context_id: str, user=Depends(current_user)):
    docs = await _fetch_contacts(app.state.db, context_type, context_id, user)
    pdf = _build_pdf(docs, f"Contacts — {context_type} / {context_id}")
    filename = f"UDAMG_contacts_{context_type}_{context_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.get("/exports/contacts-lots.pdf")
async def export_pdf_lots(context_type: str, context_id: str, user=Depends(current_user)):
    """Special EBED report: 10 contacts per page, niveau column hidden."""
    docs = await _fetch_contacts(app.state.db, context_type, context_id, user)
    pdf = _build_pdf(docs, "Convention EBED — Rapport par lots de 10", chunk_size=10, hide_niveau=True)
    filename = f"UDAMG_lots10_{context_type}_{context_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Pôle 3 — Médias & Enseignements: register BEFORE include_router
from media import register_media as _register_media
_register_media(app, api, current_user, require_role, {
    "pasteur": ROLE_PASTEUR, "ouvrier": ROLE_OUVRIER, "evangeliste": ROLE_EVANGELISTE,
})

app.include_router(api)

# (media routes registered above)


# =========================================================================== #
# ============================ EVENT PORTAL ================================= #
# =========================================================================== #
# Multi-programmes event management with participants, badges (EBED-XXXX),
# sessions, QR pointage, children count, and pastoral dashboard.
# =========================================================================== #

PROFILS = ["Membre", "Inconnu", "Prospect Évangélisé", "Prospect Famille", "Externe"]
CATEGORIES_AGE = ["Enfant (-13)", "Gédéon (-18)", "J-30 (18-30)", "CCMG (+30)"]


class ParticipantIn(BaseModel):
    evenement_id: str
    nom: str
    prenom: str
    profil: str
    categorie_age: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    eglise: Optional[str] = None
    jours_presence: List[str] = []
    referent: Optional[str] = None
    notes: Optional[str] = None


class ParticipantUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    profil: Optional[str] = None
    categorie_age: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    eglise: Optional[str] = None
    jours_presence: Optional[List[str]] = None
    referent: Optional[str] = None
    notes: Optional[str] = None
    sms_status: Optional[str] = None
    wa_status: Optional[str] = None


class Participant(BaseModel):
    id: str
    evenement_id: str
    badge_id: str
    nom: str
    prenom: str
    profil: str
    categorie_age: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    eglise: Optional[str] = None
    jours_presence: List[str] = []
    referent: Optional[str] = None
    notes: Optional[str] = None
    sms_status: str = "none"   # none | pending | sent
    wa_status: str = "none"
    created_at: datetime


class SessionIn(BaseModel):
    evenement_id: str
    nom: str


class EventSession(BaseModel):
    id: str
    evenement_id: str
    nom: str
    active: bool
    started_at: datetime
    ended_at: Optional[datetime] = None


class PointageIn(BaseModel):
    evenement_id: str
    badge_id: str


class EnfantsIn(BaseModel):
    evenement_id: str
    delta: int


def _participant_from_doc(d: dict) -> Participant:
    return Participant(
        id=d["_id"], evenement_id=d["evenement_id"], badge_id=d["badge_id"],
        nom=d["nom"], prenom=d["prenom"], profil=d.get("profil", "Externe"),
        categorie_age=d.get("categorie_age"),
        tel=d.get("tel"), email=d.get("email"), eglise=d.get("eglise"),
        jours_presence=d.get("jours_presence", []),
        referent=d.get("referent"), notes=d.get("notes"),
        sms_status=d.get("sms_status", "none"),
        wa_status=d.get("wa_status", "none"),
        created_at=d.get("created_at", datetime.now(timezone.utc)),
    )


async def _next_badge_id(db, evenement_id: str) -> str:
    count = await db.event_participants.count_documents({"evenement_id": evenement_id})
    return f"EBED-{count + 1:04d}"


# --- Participants CRUD (public inscription allowed via /public route below) --
event_api = APIRouter(prefix="/api/event")


@event_api.get("/participants")
async def list_participants(evenement_id: str, profil: Optional[str] = None,
                            eglise: Optional[str] = None, q: Optional[str] = None,
                            _=Depends(current_user)):
    query: dict = {"evenement_id": evenement_id}
    if profil: query["profil"] = profil
    if eglise: query["eglise"] = eglise
    docs = await app.state.db.event_participants.find(query).sort("nom", 1).to_list(5000)
    if q:
        s = strip_accents(q)
        docs = [d for d in docs if s in strip_accents(
            f"{d.get('nom','')} {d.get('prenom','')} {d.get('badge_id','')} {d.get('tel','') or ''} {d.get('eglise','') or ''}"
        )]
    return [_participant_from_doc(d).model_dump() for d in docs]


@event_api.post("/participants", status_code=201)
async def create_participant(data: ParticipantIn, user=Depends(current_user)):
    if data.profil not in PROFILS:
        raise HTTPException(400, f"Profil invalide (attendus : {PROFILS})")
    badge_id = await _next_badge_id(app.state.db, data.evenement_id)
    doc = {
        "_id": str(uuid4()),
        "evenement_id": data.evenement_id,
        "badge_id": badge_id,
        "nom": data.nom.strip().upper(),
        "prenom": data.prenom.strip(),
        "profil": data.profil,
        "categorie_age": data.categorie_age,
        "tel": data.tel,
        "email": (data.email or "").strip().lower() or None,
        "eglise": data.eglise,
        "jours_presence": data.jours_presence,
        "referent": data.referent or f"{user['prenom']} {user['nom']}",
        "notes": data.notes,
        "sms_status": "none",
        "wa_status": "none",
        "created_at": datetime.now(timezone.utc),
    }
    await app.state.db.event_participants.insert_one(doc)
    return _participant_from_doc(doc).model_dump()


class PublicParticipantIn(BaseModel):
    evenement_id: str
    nom: str
    prenom: str
    profil: str
    categorie_age: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    eglise: Optional[str] = None
    jours_presence: List[str] = []
    referent: Optional[str] = None


@event_api.post("/participants/public", status_code=201)
async def public_inscription(data: PublicParticipantIn):
    """Public endpoint (no auth) used by the shareable inscription form."""
    if data.profil not in PROFILS:
        raise HTTPException(400, "Profil invalide")
    evt = await app.state.db.evenements.find_one({"_id": data.evenement_id})
    if not evt:
        raise HTTPException(404, "Événement introuvable")
    badge_id = await _next_badge_id(app.state.db, data.evenement_id)
    doc = {
        "_id": str(uuid4()),
        "evenement_id": data.evenement_id,
        "badge_id": badge_id,
        "nom": data.nom.strip().upper(),
        "prenom": data.prenom.strip(),
        "profil": data.profil,
        "categorie_age": data.categorie_age,
        "tel": data.tel,
        "email": (data.email or "").strip().lower() or None,
        "eglise": data.eglise,
        "jours_presence": data.jours_presence,
        "referent": data.referent,
        "notes": None,
        "sms_status": "none",
        "wa_status": "none",
        "created_at": datetime.now(timezone.utc),
    }
    await app.state.db.event_participants.insert_one(doc)
    return _participant_from_doc(doc).model_dump()


@event_api.get("/participants/{pid}")
async def get_participant(pid: str, _=Depends(current_user)):
    d = await app.state.db.event_participants.find_one({"_id": pid})
    if not d: raise HTTPException(404, "Participant introuvable")
    return _participant_from_doc(d).model_dump()


@event_api.get("/participants/by-badge/{badge_id}")
async def get_by_badge(badge_id: str, evenement_id: str):
    """Public — used by badge page to render the ticket."""
    d = await app.state.db.event_participants.find_one({"badge_id": badge_id, "evenement_id": evenement_id})
    if not d: raise HTTPException(404, "Badge introuvable")
    return _participant_from_doc(d).model_dump()


@event_api.patch("/participants/{pid}")
async def update_participant(pid: str, data: ParticipantUpdate, _=Depends(current_user)):
    existing = await app.state.db.event_participants.find_one({"_id": pid})
    if not existing: raise HTTPException(404, "Participant introuvable")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "nom" in updates: updates["nom"] = updates["nom"].strip().upper()
    if "profil" in updates and updates["profil"] not in PROFILS:
        raise HTTPException(400, "Profil invalide")
    await app.state.db.event_participants.update_one({"_id": pid}, {"$set": updates})
    fresh = await app.state.db.event_participants.find_one({"_id": pid})
    return _participant_from_doc(fresh).model_dump()


@event_api.delete("/participants/{pid}", status_code=204)
async def delete_participant(pid: str, _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    await app.state.db.event_participants.delete_one({"_id": pid})
    return None


class PurgeInput(BaseModel):
    evenement_id: str
    confirmation: str
    only_inconnus: bool = False


@event_api.post("/participants/purge")
async def purge_participants(data: PurgeInput, _=Depends(require_role(ROLE_PASTEUR))):
    if data.confirmation != "SUPPRIMER":
        raise HTTPException(400, "Confirmation manquante — tapez SUPPRIMER")
    query: dict = {"evenement_id": data.evenement_id}
    if data.only_inconnus:
        query["profil"] = "Inconnu"
    res = await app.state.db.event_participants.delete_many(query)
    return {"deleted": res.deleted_count}


# --- Sessions -------------------------------------------------------------- #
def _session_from_doc(d: dict) -> EventSession:
    return EventSession(
        id=d["_id"], evenement_id=d["evenement_id"], nom=d["nom"],
        active=d.get("active", False), started_at=d["started_at"],
        ended_at=d.get("ended_at"),
    )


@event_api.get("/sessions")
async def list_sessions(evenement_id: str, _=Depends(current_user)):
    docs = await app.state.db.event_sessions.find({"evenement_id": evenement_id}).sort("started_at", -1).to_list(200)
    return [_session_from_doc(d).model_dump() for d in docs]


@event_api.get("/sessions/active")
async def get_active_session(evenement_id: str, _=Depends(current_user)):
    d = await app.state.db.event_sessions.find_one({"evenement_id": evenement_id, "active": True})
    return _session_from_doc(d).model_dump() if d else None


@event_api.post("/sessions/start", status_code=201)
async def start_session(data: SessionIn, _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    # Deactivate any prior active session for this event
    await app.state.db.event_sessions.update_many(
        {"evenement_id": data.evenement_id, "active": True},
        {"$set": {"active": False, "ended_at": datetime.now(timezone.utc)}},
    )
    doc = {
        "_id": str(uuid4()),
        "evenement_id": data.evenement_id,
        "nom": data.nom.strip(),
        "active": True,
        "started_at": datetime.now(timezone.utc),
    }
    await app.state.db.event_sessions.insert_one(doc)
    return _session_from_doc(doc).model_dump()


@event_api.post("/sessions/{sid}/stop")
async def stop_session(sid: str, _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER))):
    await app.state.db.event_sessions.update_one(
        {"_id": sid},
        {"$set": {"active": False, "ended_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}


class SessionPurge(BaseModel):
    session_id: str
    confirmation: str


@event_api.post("/sessions/purge-pointages")
async def purge_session_pointages(data: SessionPurge, _=Depends(require_role(ROLE_PASTEUR))):
    if data.confirmation != "SUPPRIMER":
        raise HTTPException(400, "Confirmation manquante")
    res = await app.state.db.event_pointages.delete_many({"session_id": data.session_id})
    return {"deleted": res.deleted_count}


# --- Pointages (QR check-in) ---------------------------------------------- #
@event_api.post("/pointages", status_code=201)
async def create_pointage(data: PointageIn, user=Depends(current_user)):
    active = await app.state.db.event_sessions.find_one({"evenement_id": data.evenement_id, "active": True})
    if not active:
        raise HTTPException(423, "Aucune séance active — le Pasteur doit démarrer une séance")
    p = await app.state.db.event_participants.find_one({"badge_id": data.badge_id, "evenement_id": data.evenement_id})
    if not p:
        raise HTTPException(404, "Badge inconnu pour cet événement")
    try:
        doc = {
            "_id": str(uuid4()),
            "evenement_id": data.evenement_id,
            "participant_id": p["_id"],
            "session_id": active["_id"],
            "scanned_by": user["email"],
            "timestamp": datetime.now(timezone.utc),
        }
        await app.state.db.event_pointages.insert_one(doc)
        return {
            "status": "ok",
            "participant": _participant_from_doc(p).model_dump(),
            "session_nom": active["nom"],
            "timestamp": doc["timestamp"].isoformat(),
        }
    except Exception:
        # Duplicate = already scanned this session
        return {
            "status": "already",
            "participant": _participant_from_doc(p).model_dump(),
            "session_nom": active["nom"],
        }


@event_api.get("/pointages")
async def list_pointages(evenement_id: str, session_id: Optional[str] = None,
                         limit: int = 50, _=Depends(current_user)):
    query: dict = {"evenement_id": evenement_id}
    if session_id: query["session_id"] = session_id
    docs = await app.state.db.event_pointages.find(query).sort("timestamp", -1).to_list(limit)
    out = []
    for d in docs:
        p = await app.state.db.event_participants.find_one({"_id": d["participant_id"]})
        out.append({
            "id": d["_id"],
            "timestamp": d["timestamp"].isoformat(),
            "session_id": d["session_id"],
            "scanned_by": d.get("scanned_by", ""),
            "participant": _participant_from_doc(p).model_dump() if p else None,
        })
    return out


# --- Children counter ----------------------------------------------------- #
@event_api.post("/enfants")
async def add_enfants(data: EnfantsIn, user=Depends(current_user)):
    active = await app.state.db.event_sessions.find_one({"evenement_id": data.evenement_id, "active": True})
    if not active:
        raise HTTPException(423, "Aucune séance active")
    entry = {
        "_id": str(uuid4()),
        "evenement_id": data.evenement_id,
        "session_id": active["_id"],
        "delta": data.delta,
        "by": user["email"],
        "timestamp": datetime.now(timezone.utc),
    }
    await app.state.db.event_enfants.insert_one(entry)
    total = 0
    async for e in app.state.db.event_enfants.find({"evenement_id": data.evenement_id, "session_id": active["_id"]}):
        total += e.get("delta", 0)
    return {"total": total, "session_id": active["_id"], "session_nom": active["nom"]}


@event_api.get("/enfants")
async def get_enfants(evenement_id: str, session_id: Optional[str] = None, _=Depends(current_user)):
    if not session_id:
        active = await app.state.db.event_sessions.find_one({"evenement_id": evenement_id, "active": True})
        if not active: return {"total": 0, "session_id": None, "session_nom": None}
        session_id = active["_id"]
    total = 0
    async for e in app.state.db.event_enfants.find({"evenement_id": evenement_id, "session_id": session_id}):
        total += e.get("delta", 0)
    sess = await app.state.db.event_sessions.find_one({"_id": session_id})
    return {"total": total, "session_id": session_id, "session_nom": sess["nom"] if sess else None}


# --- Dashboard stats ------------------------------------------------------ #
@event_api.get("/dashboard")
async def dashboard(evenement_id: str, _=Depends(current_user)):
    db = app.state.db
    parts = await db.event_participants.find({"evenement_id": evenement_id}).to_list(10000)
    active = await db.event_sessions.find_one({"evenement_id": evenement_id, "active": True})

    # Aggregations over all participants
    by_profil = {p: 0 for p in PROFILS}
    by_age = {c: 0 for c in CATEGORIES_AGE}
    by_eglise: dict = {}
    for p in parts:
        by_profil[p.get("profil", "Externe")] = by_profil.get(p.get("profil", "Externe"), 0) + 1
        c = p.get("categorie_age")
        if c: by_age[c] = by_age.get(c, 0) + 1
        e = p.get("eglise") or "—"
        by_eglise[e] = by_eglise.get(e, 0) + 1

    # Presence stats — participants scanned in the active session
    presence: dict = {
        "total": 0,
        "membres": 0, "vip": 0, "prospects": 0, "externes": 0, "inconnus": 0,
        "gedeon": 0, "j30": 0, "ccmg": 0, "enfants_pointes": 0,
        "by_eglise": {},
    }
    enfants_total = 0
    if active:
        pointages = await db.event_pointages.find({"session_id": active["_id"]}).to_list(10000)
        presence["total"] = len(pointages)
        # Get all participant ids scanned
        pids = {pt["participant_id"] for pt in pointages}
        for p in parts:
            if p["_id"] not in pids:
                continue
            prof = p.get("profil", "Externe")
            if prof == "Membre": presence["membres"] += 1
            elif prof == "Inconnu": presence["inconnus"] += 1
            elif prof.startswith("Prospect"): presence["prospects"] += 1
            elif prof == "Externe": presence["externes"] += 1
            # VIP heuristic: referent contains "VIP" or profil==Externe with a referent set
            if p.get("notes") and "VIP" in (p.get("notes") or "").upper():
                presence["vip"] += 1
            cage = p.get("categorie_age") or ""
            if cage.startswith("Gédéon"): presence["gedeon"] += 1
            elif cage.startswith("J-30"): presence["j30"] += 1
            elif cage.startswith("CCMG"): presence["ccmg"] += 1
            elif cage.startswith("Enfant"): presence["enfants_pointes"] += 1
            e = p.get("eglise") or "—"
            presence["by_eglise"][e] = presence["by_eglise"].get(e, 0) + 1
        async for e in db.event_enfants.find({"session_id": active["_id"]}):
            enfants_total += e.get("delta", 0)

    return {
        "total": len(parts),
        "by_profil": by_profil,
        "by_age": by_age,
        "by_eglise": by_eglise,
        "active_session": _session_from_doc(active).model_dump() if active else None,
        "pointages_active_session": presence["total"],
        "enfants_active_session": enfants_total,
        "presence": presence,
    }


# --- Exports (event) ------------------------------------------------------ #
@event_api.get("/exports/participants.csv")
async def export_participants_csv(evenement_id: str, _=Depends(current_user)):
    docs = await app.state.db.event_participants.find({"evenement_id": evenement_id}).sort("nom", 1).to_list(10000)
    lines = ["badge_id,nom,prenom,profil,eglise,tel,email,referent,jours_presence,sms_status,wa_status,created_at"]
    for d in docs:
        row = [
            d.get("badge_id", ""), d.get("nom", ""), d.get("prenom", ""),
            d.get("profil", ""), d.get("eglise", "") or "",
            d.get("tel", "") or "", d.get("email", "") or "",
            d.get("referent", "") or "",
            "|".join(d.get("jours_presence", [])),
            d.get("sms_status", "none"), d.get("wa_status", "none"),
            d.get("created_at").isoformat() if d.get("created_at") else "",
        ]
        lines.append(",".join('"' + str(c).replace('"', '""') + '"' for c in row))
    buf = io.BytesIO(("\n".join(lines)).encode("utf-8"))
    return StreamingResponse(buf, media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="participants.csv"'})


@event_api.get("/exports/bilan.pdf")
async def export_bilan_pdf(evenement_id: str, user=Depends(current_user)):
    db = app.state.db
    evt = await db.evenements.find_one({"_id": evenement_id})
    if not evt: raise HTTPException(404, "Événement introuvable")
    parts = await db.event_participants.find({"evenement_id": evenement_id}).to_list(10000)
    sessions = await db.event_sessions.find({"evenement_id": evenement_id}).sort("started_at", 1).to_list(200)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<b>UDAMG</b> — Rapport Bilan Pastoral", styles["Title"]),
        Paragraph(f"<b>{evt.get('titre', '')}</b>", styles["Heading2"]),
        Paragraph(f"Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 0.4*cm),
        Paragraph(f"<b>Total inscrits :</b> {len(parts)}", styles["Normal"]),
    ]
    # Profils
    by_profil = {p: 0 for p in PROFILS}
    for p in parts:
        by_profil[p.get("profil", "Externe")] = by_profil.get(p.get("profil", "Externe"), 0) + 1
    prof_rows = [["Profil", "Nombre"]] + [[p, str(v)] for p, v in by_profil.items()]
    t = Table(prof_rows, hAlign="LEFT", colWidths=[8*cm, 3*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0047AB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CBD5E1")),
    ]))
    story += [Spacer(1, 0.4*cm), Paragraph("<b>Répartition par profil</b>", styles["Heading3"]), t]

    # Sessions
    if sessions:
        story += [Spacer(1, 0.4*cm), Paragraph("<b>Séances & pointages</b>", styles["Heading3"])]
        rows = [["Séance", "Statut", "Pointages", "Enfants"]]
        for s in sessions:
            pcount = await db.event_pointages.count_documents({"session_id": s["_id"]})
            ecount = 0
            async for e in db.event_enfants.find({"session_id": s["_id"]}):
                ecount += e.get("delta", 0)
            status = "Active" if s.get("active") else "Terminée"
            rows.append([s["nom"], status, str(pcount), str(ecount)])
        t2 = Table(rows, hAlign="LEFT")
        t2.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0047AB")),
            ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CBD5E1")),
        ]))
        story.append(t2)

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="bilan_{evenement_id}.pdf"'})


app.include_router(event_api)
