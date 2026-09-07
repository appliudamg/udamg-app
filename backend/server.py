"""UDAMG APP backend - Evangelization & Church life management."""
import os
import logging
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, List, Optional, Literal
from uuid import uuid4

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, APIRouter, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field

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
    niveau: int = Field(default=1, ge=1, le=4)
    notes: Optional[str] = None
    context_type: Literal["ville", "programme"]
    context_id: str


class ContactUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    tel: Optional[str] = None
    categorie: Optional[str] = None
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
    await _seed(db)
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

    # Églises
    if await db.villes.count_documents({}) == 0:
        await db.villes.insert_many([
            {"_id": str(uuid4()), "nom": "CCMG Paris", "code_postal": "75001", "pays": "France", "whatsapp_link": "https://chat.whatsapp.com/paris"},
            {"_id": str(uuid4()), "nom": "CCMG Angers", "code_postal": "49000", "pays": "France", "whatsapp_link": "https://chat.whatsapp.com/angers"},
            {"_id": str(uuid4()), "nom": "CCMG Nantes", "code_postal": "44000", "pays": "France", "whatsapp_link": "https://chat.whatsapp.com/nantes"},
            {"_id": str(uuid4()), "nom": "CCMG Lyon", "code_postal": "69001", "pays": "France", "whatsapp_link": "https://chat.whatsapp.com/lyon"},
        ])

    # Programmes
    if await db.programmes.count_documents({}) == 0:
        await db.programmes.insert_many([
            {"_id": str(uuid4()), "nom": "Convention EBED 2026", "description": "Grande convention nationale", "code_acces": "EBED2026", "is_ebed": True},
            {"_id": str(uuid4()), "nom": "Retraite Spirituelle", "description": "Retraite annuelle des responsables", "code_acces": "RETRAITE", "is_ebed": False},
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
        "referent": f"{user['prenom']} {user['nom']}".strip(),
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
    }


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
    }


app.include_router(api)
