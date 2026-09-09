"""
Pôle 3 — Médias & Enseignements
Registered on the main FastAPI app via `register_media(app, api, current_user, require_role, roles)`.

Uses Emergent Object Storage for audio + cover art.
"""
from __future__ import annotations

import os
import logging
import mimetypes
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

import requests
import jwt
from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger("udamg.media")

# --------------------------------------------------------------------------- #
# Emergent Object Storage helpers
# --------------------------------------------------------------------------- #
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "udamg"

_storage_key: Optional[str] = None


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not set")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _reset_key():
    global _storage_key
    _storage_key = None


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=300,
    )
    if resp.status_code == 503:
        _reset_key(); key = _init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=300,
        )
    if resp.status_code == 402:
        raise HTTPException(402, "Crédits Emergent épuisés")
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=120)
    if resp.status_code == 503:
        _reset_key(); key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=120)
    if resp.status_code >= 400:
        raise HTTPException(404, "Fichier introuvable")
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def init_storage_async():
    try:
        await run_in_threadpool(_init_storage)
        logger.info("Object Storage initialised")
    except Exception as e:
        logger.warning("Object Storage init failed: %s", e)


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
MEDIA_CATEGORIES = [
    "Foi & Méditation",
    "Leadership",
    "Enseignements du Dimanche",
    "Prières & Worship",
    "Podcasts",
    "Livres Audio",
]

MEDIA_KINDS = ["audio", "video", "podcast", "livre"]


class MediaItem(BaseModel):
    id: str
    title: str
    author: str
    category: str
    kind: str = "audio"
    audio_path: Optional[str] = None
    cover_path: Optional[str] = None
    duration: Optional[int] = None
    description: Optional[str] = None
    transcript: Optional[str] = None
    created_at: datetime
    created_by: Optional[str] = None


class MediaUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    kind: Optional[str] = None
    description: Optional[str] = None
    transcript: Optional[str] = None
    duration: Optional[int] = None


class Playlist(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    item_ids: List[str] = []
    updated_at: datetime


class PlaylistCreate(BaseModel):
    title: str
    description: Optional[str] = None


class PlaylistUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    item_ids: Optional[List[str]] = None


class ProgressPayload(BaseModel):
    media_id: str
    last_position_seconds: float
    completed: bool = False


class ProgressOut(BaseModel):
    media_id: str
    last_position_seconds: float
    completed: bool
    updated_at: datetime


def _doc_to_media(d: dict) -> MediaItem:
    return MediaItem(
        id=d["_id"],
        title=d["title"],
        author=d["author"],
        category=d["category"],
        kind=d.get("kind", "audio"),
        audio_path=d.get("audio_path"),
        cover_path=d.get("cover_path"),
        duration=d.get("duration"),
        description=d.get("description"),
        transcript=d.get("transcript"),
        created_at=d.get("created_at", datetime.now(timezone.utc)),
        created_by=d.get("created_by"),
    )


def _now():
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Seed
# --------------------------------------------------------------------------- #
SEED_MEDIA = [
    {"title": "La grâce qui transforme", "author": "Pasteur Marc",
     "category": "Enseignements du Dimanche", "kind": "audio",
     "description": "Un enseignement puissant sur l'œuvre de la grâce dans le cœur du croyant.",
     "cover_hue": "#8B0000"},
    {"title": "Diriger avec humilité", "author": "Pasteur Jean",
     "category": "Leadership", "kind": "audio",
     "description": "Les fondements bibliques du leadership serviteur.",
     "cover_hue": "#5B21B6"},
    {"title": "Prière du matin", "author": "Sœur Claire",
     "category": "Prières & Worship", "kind": "audio",
     "description": "5 minutes de méditation pour bien commencer la journée.",
     "cover_hue": "#B45309"},
    {"title": "Podcast — Foi & Vie #12", "author": "Équipe CCMG",
     "category": "Podcasts", "kind": "podcast",
     "description": "Discussion autour des questions des jeunes chrétiens.",
     "cover_hue": "#0F766E"},
    {"title": "Adoration — Louez l'Éternel", "author": "Chorale CCMG",
     "category": "Prières & Worship", "kind": "audio",
     "description": "Un moment de louange collective enregistré à Angers.",
     "cover_hue": "#7C2D12"},
    {"title": "Méditation sur le Psaume 23", "author": "Pasteur Marc",
     "category": "Foi & Méditation", "kind": "audio",
     "description": "L'Éternel est mon berger : je ne manquerai de rien.",
     "cover_hue": "#134E4A"},
    {"title": "Convention EBED 2025 — Session 1", "author": "Divers intervenants",
     "category": "Enseignements du Dimanche", "kind": "audio",
     "description": "Session d'ouverture de la convention nationale.",
     "cover_hue": "#4C1D95"},
    {"title": "Livre audio — Vivre par la foi", "author": "Auteur invité",
     "category": "Livres Audio", "kind": "livre",
     "description": "Chapitre 1 : les fondations de la marche par la foi.",
     "cover_hue": "#991B1B"},
]


async def seed_media(db):
    """Idempotent: creates the demo media catalog only if empty."""
    if await db.media_items.count_documents({}) > 0:
        return
    now = _now()
    docs = []
    for m in SEED_MEDIA:
        docs.append({
            "_id": str(uuid4()),
            "title": m["title"],
            "author": m["author"],
            "category": m["category"],
            "kind": m["kind"],
            "audio_path": None,   # to be filled by admin upload
            "cover_path": None,
            "cover_hue": m["cover_hue"],  # fallback color for placeholder cover
            "duration": None,
            "description": m["description"],
            "transcript": None,
            "created_at": now,
            "created_by": None,
        })
    if docs:
        await db.media_items.insert_many(docs)


# --------------------------------------------------------------------------- #
# Registration
# --------------------------------------------------------------------------- #
def register_media(app, api_router, current_user, require_role, roles):
    """
    Attach all media endpoints to the existing `api_router` (prefix /api).

    - current_user, require_role: FastAPI dependency callables from server.py
    - roles: dict with 'pasteur', 'ouvrier', 'evangeliste' role string constants
    """
    ROLE_PASTEUR = roles["pasteur"]
    ROLE_OUVRIER = roles["ouvrier"]

    # ============================== MEDIA CRUD ============================== #
    @api_router.get("/media", response_model=List[MediaItem])
    async def list_media(
        request: Request,
        category: Optional[str] = Query(None),
        kind: Optional[str] = Query(None),
        q: Optional[str] = Query(None),
        limit: int = Query(200, le=500),
        _=Depends(current_user),
    ):
        db = request.app.state.db
        query: dict = {}
        if category:
            query["category"] = category
        if kind:
            query["kind"] = kind
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"author": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
            ]
        docs = await db.media_items.find(query).sort("created_at", -1).to_list(limit)
        return [_doc_to_media(d) for d in docs]

    @api_router.get("/media/categories")
    async def media_categories(_=Depends(current_user)):
        return {"categories": MEDIA_CATEGORIES, "kinds": MEDIA_KINDS}

    @api_router.get("/media/{mid}", response_model=MediaItem)
    async def get_media(mid: str, request: Request, _=Depends(current_user)):
        d = await request.app.state.db.media_items.find_one({"_id": mid})
        if not d:
            raise HTTPException(404, "Média introuvable")
        return _doc_to_media(d)

    @api_router.post("/media/create-json", response_model=MediaItem, status_code=201)
    async def create_media_json(
        request: Request,
        data: dict,
        user=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER)),
    ):
        """Create media WITHOUT files. Use POST /media/{id}/upload afterwards.
        Preferred path for native clients where multipart with files is fragile."""
        db = request.app.state.db
        title = (data.get("title") or "").strip()
        author = (data.get("author") or "").strip()
        category = data.get("category") or ""
        kind_ = data.get("kind") or "audio"
        if not title or not author:
            raise HTTPException(400, "Titre et orateur requis")
        if category not in MEDIA_CATEGORIES:
            raise HTTPException(400, f"Catégorie invalide (attendues: {MEDIA_CATEGORIES})")
        if kind_ not in MEDIA_KINDS:
            raise HTTPException(400, f"Type invalide (attendus: {MEDIA_KINDS})")
        mid = str(uuid4())
        doc = {
            "_id": mid, "title": title, "author": author,
            "category": category, "kind": kind_,
            "audio_path": None, "cover_path": None,
            "duration": data.get("duration"),
            "description": (data.get("description") or "").strip() or None,
            "transcript": (data.get("transcript") or "").strip() or None,
            "created_at": _now(),
            "created_by": user["_id"],
        }
        await db.media_items.insert_one(doc)
        return _doc_to_media(doc)

    @api_router.post("/media/{mid}/upload", response_model=MediaItem)
    async def upload_media_file(
        mid: str,
        request: Request,
        kind: str = Form(...),  # "audio" | "cover"
        file: UploadFile = File(...),
        _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER)),
    ):
        """Upload one file (audio OR cover) to an existing media entry.
        Preferred path for native clients using FileSystem.uploadAsync (one file per call)."""
        db = request.app.state.db
        if kind not in ("audio", "cover"):
            raise HTTPException(400, "kind doit être 'audio' ou 'cover'")
        media = await db.media_items.find_one({"_id": mid})
        if not media:
            raise HTTPException(404, "Média introuvable")
        data = await file.read()
        if not data:
            raise HTTPException(400, "Fichier vide")
        ext = (file.filename or f"{kind}.bin").rsplit(".", 1)[-1].lower()[:5] or ("mp3" if kind == "audio" else "jpg")
        path = f"{APP_NAME}/media/{mid}/{kind}.{ext}"
        ct = file.content_type or mimetypes.guess_type(file.filename or "")[0] or (
            "audio/mpeg" if kind == "audio" else "image/jpeg"
        )
        await run_in_threadpool(_put_object, path, data, ct)
        field = "audio_path" if kind == "audio" else "cover_path"
        await db.media_items.update_one({"_id": mid}, {"$set": {field: path}})
        fresh = await db.media_items.find_one({"_id": mid})
        return _doc_to_media(fresh)

    @api_router.post("/media", response_model=MediaItem, status_code=201)
    async def create_media(
        request: Request,
        title: str = Form(...),
        author: str = Form(...),
        category: str = Form(...),
        kind: str = Form("audio"),
        description: Optional[str] = Form(None),
        transcript: Optional[str] = Form(None),
        duration: Optional[int] = Form(None),
        audio: Optional[UploadFile] = File(None),
        cover: Optional[UploadFile] = File(None),
        user=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER)),
    ):
        db = request.app.state.db
        if category not in MEDIA_CATEGORIES:
            raise HTTPException(400, f"Catégorie invalide (attendues: {MEDIA_CATEGORIES})")
        if kind not in MEDIA_KINDS:
            raise HTTPException(400, f"Type invalide (attendus: {MEDIA_KINDS})")

        mid = str(uuid4())
        audio_path = None
        cover_path = None

        if audio is not None:
            audio_bytes = await audio.read()
            if not audio_bytes:
                raise HTTPException(400, "Fichier audio vide")
            ext = (audio.filename or "audio.mp3").rsplit(".", 1)[-1].lower()[:5] or "mp3"
            audio_path = f"{APP_NAME}/media/{mid}/audio.{ext}"
            ct = audio.content_type or mimetypes.guess_type(audio.filename or "")[0] or "audio/mpeg"
            await run_in_threadpool(_put_object, audio_path, audio_bytes, ct)

        if cover is not None:
            cover_bytes = await cover.read()
            if cover_bytes:
                ext = (cover.filename or "cover.jpg").rsplit(".", 1)[-1].lower()[:5] or "jpg"
                cover_path = f"{APP_NAME}/media/{mid}/cover.{ext}"
                ct = cover.content_type or mimetypes.guess_type(cover.filename or "")[0] or "image/jpeg"
                await run_in_threadpool(_put_object, cover_path, cover_bytes, ct)

        doc = {
            "_id": mid, "title": title.strip(), "author": author.strip(),
            "category": category, "kind": kind,
            "audio_path": audio_path, "cover_path": cover_path,
            "duration": duration, "description": description,
            "transcript": transcript,
            "created_at": _now(),
            "created_by": user["_id"],
        }
        await db.media_items.insert_one(doc)
        return _doc_to_media(doc)

    @api_router.patch("/media/{mid}", response_model=MediaItem)
    async def update_media(
        mid: str,
        data: MediaUpdate,
        request: Request,
        _=Depends(require_role(ROLE_PASTEUR, ROLE_OUVRIER)),
    ):
        db = request.app.state.db
        existing = await db.media_items.find_one({"_id": mid})
        if not existing:
            raise HTTPException(404, "Média introuvable")
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "category" in updates and updates["category"] not in MEDIA_CATEGORIES:
            raise HTTPException(400, "Catégorie invalide")
        if "kind" in updates and updates["kind"] not in MEDIA_KINDS:
            raise HTTPException(400, "Type invalide")
        if updates:
            await db.media_items.update_one({"_id": mid}, {"$set": updates})
        fresh = await db.media_items.find_one({"_id": mid})
        return _doc_to_media(fresh)

    @api_router.delete("/media/{mid}", status_code=204)
    async def delete_media(mid: str, request: Request, _=Depends(require_role(ROLE_PASTEUR))):
        db = request.app.state.db
        res = await db.media_items.delete_one({"_id": mid})
        if res.deleted_count == 0:
            raise HTTPException(404, "Média introuvable")
        # cascade: playlists, favorites, progress
        await db.playlists.update_many({}, {"$pull": {"item_ids": mid}})
        await db.favorites.delete_many({"media_id": mid})
        await db.user_progress.delete_many({"media_id": mid})
        return None

    # ============================== FILE STREAM ============================== #
    @api_router.get("/media/{mid}/file")
    async def stream_media_file(
        mid: str,
        request: Request,
        token: Optional[str] = Query(None),
    ):
        # accept either Bearer header (native) or ?token=... (web / iOS AVPlayer)
        auth_hdr = request.headers.get("authorization") or ""
        jwt_token = None
        if auth_hdr.lower().startswith("bearer "):
            jwt_token = auth_hdr.split(" ", 1)[1].strip()
        if not jwt_token and token:
            jwt_token = token
        if not jwt_token:
            raise HTTPException(401, "Token requis")
        try:
            secret = os.environ["JWT_SECRET"]
            jwt.decode(jwt_token, secret, algorithms=["HS256"], issuer=os.environ.get("JWT_ISSUER", "udamg-api"))
        except Exception:
            raise HTTPException(401, "Token invalide")

        d = await request.app.state.db.media_items.find_one({"_id": mid})
        if not d or not d.get("audio_path"):
            raise HTTPException(404, "Audio non disponible")
        content, ctype = await run_in_threadpool(_get_object, d["audio_path"])
        total = len(content)

        # Handle HTTP Range requests (required by iOS AVPlayer / expo-audio for streaming)
        range_header = request.headers.get("range") or request.headers.get("Range")
        if range_header:
            import re as _re
            m = _re.match(r"bytes=(\d+)-(\d*)", range_header)
            if m:
                start = int(m.group(1))
                end_s = m.group(2)
                end = int(end_s) if end_s else total - 1
                if start >= total:
                    return Response(status_code=416, headers={"Content-Range": f"bytes */{total}"})
                end = min(end, total - 1)
                length = end - start + 1
                return Response(
                    content=content[start:end + 1],
                    status_code=206,
                    media_type=ctype,
                    headers={
                        "Content-Range": f"bytes {start}-{end}/{total}",
                        "Accept-Ranges": "bytes",
                        "Content-Length": str(length),
                        "Cache-Control": "public, max-age=3600",
                    },
                )

        return Response(
            content=content,
            media_type=ctype,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(total),
                "Cache-Control": "public, max-age=3600",
            },
        )

    @api_router.get("/media/{mid}/cover")
    async def stream_media_cover(mid: str, request: Request):
        d = await request.app.state.db.media_items.find_one({"_id": mid})
        if not d or not d.get("cover_path"):
            raise HTTPException(404, "Pochette non disponible")
        content, ctype = await run_in_threadpool(_get_object, d["cover_path"])
        return Response(content=content, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})

    # ============================== FAVORITES ============================== #
    @api_router.get("/media/favorites/list", response_model=List[MediaItem])
    async def list_favorites(request: Request, user=Depends(current_user)):
        db = request.app.state.db
        favs = await db.favorites.find({"user_id": user["_id"]}).to_list(500)
        ids = [f["media_id"] for f in favs]
        if not ids:
            return []
        docs = await db.media_items.find({"_id": {"$in": ids}}).to_list(500)
        # preserve favorite order (most recent first)
        order = {mid: i for i, mid in enumerate(ids)}
        docs.sort(key=lambda d: order.get(d["_id"], 0))
        return [_doc_to_media(d) for d in docs]

    @api_router.post("/media/{mid}/favorite", status_code=201)
    async def add_favorite(mid: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        if not await db.media_items.find_one({"_id": mid}):
            raise HTTPException(404, "Média introuvable")
        await db.favorites.update_one(
            {"user_id": user["_id"], "media_id": mid},
            {"$set": {"user_id": user["_id"], "media_id": mid, "created_at": _now()}},
            upsert=True,
        )
        return {"ok": True}

    @api_router.delete("/media/{mid}/favorite", status_code=204)
    async def del_favorite(mid: str, request: Request, user=Depends(current_user)):
        await request.app.state.db.favorites.delete_one({"user_id": user["_id"], "media_id": mid})
        return None

    # ============================== PLAYLISTS ============================== #
    def _pl_doc_to_model(d: dict) -> Playlist:
        return Playlist(
            id=d["_id"], user_id=d["user_id"], title=d["title"],
            description=d.get("description"), item_ids=d.get("item_ids", []),
            updated_at=d.get("updated_at", _now()),
        )

    @api_router.get("/playlists", response_model=List[Playlist])
    async def list_playlists(request: Request, user=Depends(current_user)):
        docs = await request.app.state.db.playlists.find({"user_id": user["_id"]}).sort("updated_at", -1).to_list(200)
        return [_pl_doc_to_model(d) for d in docs]

    @api_router.get("/playlists/{pid}", response_model=Playlist)
    async def get_playlist(pid: str, request: Request, user=Depends(current_user)):
        d = await request.app.state.db.playlists.find_one({"_id": pid, "user_id": user["_id"]})
        if not d:
            raise HTTPException(404, "Playlist introuvable")
        return _pl_doc_to_model(d)

    @api_router.post("/playlists", response_model=Playlist, status_code=201)
    async def create_playlist(data: PlaylistCreate, request: Request, user=Depends(current_user)):
        doc = {
            "_id": str(uuid4()), "user_id": user["_id"],
            "title": data.title.strip() or "Sans titre",
            "description": data.description, "item_ids": [],
            "updated_at": _now(),
        }
        await request.app.state.db.playlists.insert_one(doc)
        return _pl_doc_to_model(doc)

    @api_router.patch("/playlists/{pid}", response_model=Playlist)
    async def update_playlist(pid: str, data: PlaylistUpdate, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        existing = await db.playlists.find_one({"_id": pid, "user_id": user["_id"]})
        if not existing:
            raise HTTPException(404, "Playlist introuvable")
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        updates["updated_at"] = _now()
        await db.playlists.update_one({"_id": pid}, {"$set": updates})
        fresh = await db.playlists.find_one({"_id": pid})
        return _pl_doc_to_model(fresh)

    @api_router.delete("/playlists/{pid}", status_code=204)
    async def delete_playlist(pid: str, request: Request, user=Depends(current_user)):
        res = await request.app.state.db.playlists.delete_one({"_id": pid, "user_id": user["_id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Playlist introuvable")
        return None

    @api_router.post("/playlists/{pid}/items/{mid}", response_model=Playlist)
    async def add_item(pid: str, mid: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        if not await db.media_items.find_one({"_id": mid}):
            raise HTTPException(404, "Média introuvable")
        pl = await db.playlists.find_one({"_id": pid, "user_id": user["_id"]})
        if not pl:
            raise HTTPException(404, "Playlist introuvable")
        items = pl.get("item_ids", [])
        if mid not in items:
            items.append(mid)
        await db.playlists.update_one({"_id": pid}, {"$set": {"item_ids": items, "updated_at": _now()}})
        fresh = await db.playlists.find_one({"_id": pid})
        return _pl_doc_to_model(fresh)

    @api_router.delete("/playlists/{pid}/items/{mid}", response_model=Playlist)
    async def remove_item(pid: str, mid: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        pl = await db.playlists.find_one({"_id": pid, "user_id": user["_id"]})
        if not pl:
            raise HTTPException(404, "Playlist introuvable")
        items = [i for i in pl.get("item_ids", []) if i != mid]
        await db.playlists.update_one({"_id": pid}, {"$set": {"item_ids": items, "updated_at": _now()}})
        fresh = await db.playlists.find_one({"_id": pid})
        return _pl_doc_to_model(fresh)

    # ============================== PROGRESS ============================== #
    @api_router.post("/media/progress", response_model=ProgressOut)
    async def save_progress(data: ProgressPayload, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        doc = {
            "user_id": user["_id"], "media_id": data.media_id,
            "last_position_seconds": max(0.0, float(data.last_position_seconds)),
            "completed": bool(data.completed),
            "updated_at": _now(),
        }
        await db.user_progress.update_one(
            {"user_id": user["_id"], "media_id": data.media_id},
            {"$set": doc}, upsert=True,
        )
        return ProgressOut(**{k: v for k, v in doc.items() if k != "user_id"})

    @api_router.get("/media/progress/list", response_model=List[ProgressOut])
    async def list_progress(request: Request, user=Depends(current_user)):
        docs = await request.app.state.db.user_progress.find({"user_id": user["_id"]}).sort("updated_at", -1).to_list(100)
        return [ProgressOut(
            media_id=d["media_id"],
            last_position_seconds=d.get("last_position_seconds", 0.0),
            completed=d.get("completed", False),
            updated_at=d.get("updated_at", _now()),
        ) for d in docs]

    @api_router.get("/media/progress/continue", response_model=List[MediaItem])
    async def continue_listening(request: Request, user=Depends(current_user), limit: int = 10):
        db = request.app.state.db
        progs = await db.user_progress.find({
            "user_id": user["_id"],
            "completed": {"$ne": True},
            "last_position_seconds": {"$gt": 5},
        }).sort("updated_at", -1).to_list(limit)
        ids = [p["media_id"] for p in progs]
        if not ids:
            return []
        docs = await db.media_items.find({"_id": {"$in": ids}}).to_list(limit)
        order = {mid: i for i, mid in enumerate(ids)}
        docs.sort(key=lambda d: order.get(d["_id"], 0))
        return [_doc_to_media(d) for d in docs]
