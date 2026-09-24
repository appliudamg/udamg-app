"""Pôle Media (Audios / Vidéos) — Supabase Postgres + Supabase Storage."""
import os
import tempfile
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from qtfaststart import processor as qt_processor
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core import (
    MEDIA_WRITE_ROLES, RESTRICTED_SUBCATEGORIES, SUPABASE_URL,
    can_read_restricted_media, current_user, new_id, now_iso, require_role, sb, user_from_token,
)

router = APIRouter(prefix="/api")

MEDIA_BUCKET = "media"
COVER_BUCKET = "covers"
SIGNED_URL_TTL = 6 * 3600

TAXONOMY = [
    {"key": "culte_dimanche", "label": "Culte du dimanche", "subcategories": []},
    {"key": "programmes", "label": "Programmes", "subcategories": ["UDAMG", "CAMP", "Autre"]},
    {"key": "programmes_speciaux", "label": "Programmes spéciaux",
     "subcategories": ["Convention", "Nuit de la bonne nouvelle", "Autre"]},
    {"key": "enseignements", "label": "Enseignements", "subcategories": []},
    {"key": "reunions", "label": "Réunions", "subcategories": ["Réunion Pasteur", "Conseil élargi"]},
    {"key": "podcasts", "label": "Podcasts", "subcategories": []},
    {"key": "story", "label": "Story", "subcategories": []},
]
CATEGORY_KEYS = {t["key"]: t for t in TAXONOMY}
KINDS = ["audio", "video"]


# --------------------------------------------------------------------------- #
# Modèles
# --------------------------------------------------------------------------- #
class MediaItem(BaseModel):
    id: str
    title: str
    author: str
    category: str
    category_label: str
    subcategory: Optional[str] = None
    kind: str
    audio_path: Optional[str] = None
    cover_path: Optional[str] = None
    cover_url: Optional[str] = None
    duration: Optional[float] = None
    description: Optional[str] = None
    transcript: Optional[str] = None
    created_at: str
    created_by: Optional[str] = None
    stream_url: Optional[str] = None


class MediaCreate(BaseModel):
    title: str
    author: str = ""
    category: str
    subcategory: Optional[str] = None
    kind: Literal["audio", "video"] = "audio"
    description: Optional[str] = None
    transcript: Optional[str] = None
    duration: Optional[float] = None


class MediaUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    kind: Optional[Literal["audio", "video"]] = None
    description: Optional[str] = None
    transcript: Optional[str] = None
    duration: Optional[float] = None


class UploadUrlRequest(BaseModel):
    field: Literal["audio", "cover"]
    filename: str
    content_type: Optional[str] = None


class ConfirmUpload(BaseModel):
    field: Literal["audio", "cover"]
    path: str
    duration: Optional[float] = None
    content_type: Optional[str] = None


class Playlist(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    item_ids: List[str] = []
    updated_at: str


class PlaylistIn(BaseModel):
    title: str
    description: Optional[str] = None


class ProgressIn(BaseModel):
    media_id: str
    position_seconds: float
    completed: bool = False


class ProgressOut(BaseModel):
    media_id: str
    last_position_seconds: float
    completed: bool
    updated_at: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def cover_public_url(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    return f"{SUPABASE_URL}/storage/v1/object/public/{COVER_BUCKET}/{path}"


def to_item(d: dict) -> MediaItem:
    return MediaItem(
        id=d["id"], title=d["title"], author=d.get("author") or "",
        category=d["category"], category_label=CATEGORY_KEYS.get(d["category"], {}).get("label", d["category"]),
        subcategory=d.get("subcategory"), kind=d.get("kind", "audio"),
        audio_path=d.get("audio_path"), cover_path=d.get("cover_path"),
        cover_url=cover_public_url(d.get("cover_path")),
        duration=d.get("duration"), description=d.get("description"), transcript=d.get("transcript"),
        created_at=d["created_at"], created_by=d.get("created_by"),
    )


def attach_stream_urls(items: List[MediaItem]) -> List[MediaItem]:
    """URL signée directe (lecture instantanée, requêtes Range gérées par Supabase Storage)."""
    paths = [i.audio_path for i in items if i.audio_path]
    if not paths:
        return items
    try:
        signed = sb().storage.from_(MEDIA_BUCKET).create_signed_urls(paths, SIGNED_URL_TTL)
        by_path = {}
        for entry in signed:
            url = entry.get("signedURL") or entry.get("signedUrl")
            if url and entry.get("path"):
                by_path[entry["path"]] = url
        for i in items:
            if i.audio_path:
                i.stream_url = by_path.get(i.audio_path)
    except Exception as e:  # noqa: BLE001
        from core import logger
        logger.warning("Signature des URLs impossible : %s", e)
    return items


def faststart_in_place(bucket: str, path: str, content_type: str) -> None:
    """Déplace l'atome moov en tête (MP4/M4A) pour un démarrage immédiat du streaming."""
    ext = path.rsplit(".", 1)[-1].lower()
    if ext not in ("mp4", "m4a", "m4v", "mov"):
        return
    data = sb().storage.from_(bucket).download(path)
    src = tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False)
    dst_path = src.name + f".fast.{ext}"
    try:
        src.write(data)
        src.close()
        try:
            qt_processor.process(src.name, dst_path)
        except Exception:
            return  # déjà optimisé ou format non pris en charge
        with open(dst_path, "rb") as f:
            out = f.read()
        if out[:8] != data[:8] or len(out) != len(data):
            pass
        sb().storage.from_(bucket).upload(path, out, {"content-type": content_type, "upsert": "true"})
    finally:
        for f in (src.name, dst_path):
            try:
                os.remove(f)
            except OSError:
                pass


def is_restricted(d: dict) -> bool:
    return (d.get("subcategory") or "") in RESTRICTED_SUBCATEGORIES


def visible(d: dict, user: dict) -> bool:
    return can_read_restricted_media(user) or not is_restricted(d)


def get_media_or_404(mid: str) -> dict:
    res = sb().table("media_items").select("*").eq("id", mid).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Média introuvable")
    return res.data[0]


def validate_taxonomy(category: str, subcategory: Optional[str]) -> Optional[str]:
    tax = CATEGORY_KEYS.get(category)
    if not tax:
        raise HTTPException(400, f"Catégorie invalide : {category}")
    if tax["subcategories"]:
        if subcategory not in tax["subcategories"]:
            raise HTTPException(400, f"Sous-catégorie requise pour « {tax['label']} » : {tax['subcategories']}")
        return subcategory
    return None


def items_by_ids(ids: List[str], user: dict) -> List[MediaItem]:
    if not ids:
        return []
    res = sb().table("media_items").select("*").in_("id", ids).execute()
    by_id = {d["id"]: d for d in res.data if visible(d, user)}
    return attach_stream_urls([to_item(by_id[i]) for i in ids if i in by_id])


# --------------------------------------------------------------------------- #
# Catalogue
# --------------------------------------------------------------------------- #
@router.get("/media/categories")
def list_categories(user=Depends(current_user)):
    tax = []
    for t in TAXONOMY:
        subs = [s for s in t["subcategories"] if can_read_restricted_media(user) or s not in RESTRICTED_SUBCATEGORIES]
        if t["subcategories"] and not subs:
            continue
        tax.append({**t, "subcategories": subs})
    return {"categories": tax, "kinds": KINDS, "can_write": user["role"] in MEDIA_WRITE_ROLES}


@router.get("/media", response_model=List[MediaItem])
def list_media(
    q: Optional[str] = None, kind: Optional[str] = None,
    category: Optional[str] = None, subcategory: Optional[str] = None,
    limit: int = Query(200, le=500), user=Depends(current_user),
):
    qry = sb().table("media_items").select("*").order("created_at", desc=True).limit(limit)
    if kind:
        qry = qry.eq("kind", kind)
    if category:
        qry = qry.eq("category", category)
    if subcategory:
        qry = qry.eq("subcategory", subcategory)
    if q:
        s = q.replace(",", " ").strip()
        qry = qry.or_(f"title.ilike.%{s}%,author.ilike.%{s}%,description.ilike.%{s}%")
    return attach_stream_urls([to_item(d) for d in qry.execute().data if visible(d, user)])


@router.get("/media/favorites/list", response_model=List[MediaItem])
def list_favorites(user=Depends(current_user)):
    res = sb().table("favorites").select("media_id").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return items_by_ids([f["media_id"] for f in res.data], user)


@router.get("/media/progress/list", response_model=List[ProgressOut])
def list_progress(user=Depends(current_user)):
    res = sb().table("user_progress").select("*").eq("user_id", user["id"]).execute()
    return [ProgressOut(**{k: d[k] for k in ("media_id", "last_position_seconds", "completed", "updated_at")}) for d in res.data]


@router.get("/media/progress/continue", response_model=List[MediaItem])
def continue_listening(user=Depends(current_user)):
    res = (sb().table("user_progress").select("media_id").eq("user_id", user["id"]).eq("completed", False)
           .gt("last_position_seconds", 5).order("updated_at", desc=True).limit(10).execute())
    return items_by_ids([p["media_id"] for p in res.data], user)


@router.post("/media/progress", response_model=ProgressOut)
def save_progress(data: ProgressIn, user=Depends(current_user)):
    row = {"user_id": user["id"], "media_id": data.media_id, "last_position_seconds": max(0.0, data.position_seconds),
           "completed": data.completed, "updated_at": now_iso()}
    sb().table("user_progress").upsert(row, on_conflict="user_id,media_id").execute()
    return ProgressOut(**{k: row[k] for k in ("media_id", "last_position_seconds", "completed", "updated_at")})


@router.get("/media/{mid}", response_model=MediaItem)
def get_media(mid: str, user=Depends(current_user)):
    d = get_media_or_404(mid)
    if not visible(d, user):
        raise HTTPException(403, "Contenu réservé aux Pasteurs / Missionnaires / Bergers")
    return attach_stream_urls([to_item(d)])[0]


# --------------------------------------------------------------------------- #
# Écriture (Équipe technique)
# --------------------------------------------------------------------------- #
write_dep = require_role(*MEDIA_WRITE_ROLES)


@router.post("/media/create-json", response_model=MediaItem, status_code=201)
def create_media(data: MediaCreate, user=Depends(write_dep)):
    if not data.title.strip():
        raise HTTPException(400, "Titre requis")
    sub = validate_taxonomy(data.category, data.subcategory)
    row = {
        "id": new_id(), "title": data.title.strip(), "author": data.author.strip(),
        "category": data.category, "subcategory": sub, "kind": data.kind,
        "description": data.description, "transcript": data.transcript, "duration": data.duration,
        "created_by": user["id"], "created_at": now_iso(),
    }
    res = sb().table("media_items").insert(row).execute()
    return to_item(res.data[0])


@router.post("/media/{mid}/upload-url")
def create_upload_url(mid: str, data: UploadUrlRequest, _=Depends(write_dep)):
    """Génère une URL signée Supabase Storage ; le client envoie le fichier en PUT directement."""
    get_media_or_404(mid)
    ext = (data.filename.rsplit(".", 1)[-1].lower() if "." in data.filename else "bin")[:8]
    bucket = MEDIA_BUCKET if data.field == "audio" else COVER_BUCKET
    path = f"{mid}/{data.field}-{new_id()[:8]}.{ext}"
    signed = sb().storage.from_(bucket).create_signed_upload_url(path)
    return {"bucket": bucket, "path": path, "upload_url": signed["signed_url"], "token": signed["token"]}


@router.post("/media/{mid}/confirm", response_model=MediaItem)
def confirm_upload(mid: str, data: ConfirmUpload, _=Depends(write_dep)):
    d = get_media_or_404(mid)
    bucket = MEDIA_BUCKET if data.field == "audio" else COVER_BUCKET
    col = "audio_path" if data.field == "audio" else "cover_path"
    old = d.get(col)
    if old and old != data.path:
        try:
            sb().storage.from_(bucket).remove([old])
        except Exception:
            pass
    if data.field == "audio":
        try:
            faststart_in_place(MEDIA_BUCKET, data.path, data.content_type or ("video/mp4" if d.get("kind") == "video" else "audio/mp4"))
        except Exception as e:  # noqa: BLE001
            from core import logger
            logger.warning("Faststart ignoré : %s", e)
    updates = {col: data.path}
    if data.duration is not None:
        updates["duration"] = data.duration
    res = sb().table("media_items").update(updates).eq("id", mid).execute()
    return attach_stream_urls([to_item(res.data[0])])[0]


@router.patch("/media/{mid}", response_model=MediaItem)
def update_media(mid: str, data: MediaUpdate, _=Depends(write_dep)):
    d = get_media_or_404(mid)
    updates = data.model_dump(exclude_unset=True)
    if "category" in updates or "subcategory" in updates:
        cat = updates.get("category", d["category"])
        updates["category"] = cat
        updates["subcategory"] = validate_taxonomy(cat, updates.get("subcategory", d.get("subcategory")))
    if not updates:
        return to_item(d)
    res = sb().table("media_items").update(updates).eq("id", mid).execute()
    return to_item(res.data[0])


@router.delete("/media/{mid}", status_code=204)
def delete_media(mid: str, _=Depends(write_dep)):
    d = get_media_or_404(mid)
    for bucket, col in ((MEDIA_BUCKET, "audio_path"), (COVER_BUCKET, "cover_path")):
        if d.get(col):
            try:
                sb().storage.from_(bucket).remove([d[col]])
            except Exception:
                pass
    sb().table("media_items").delete().eq("id", mid).execute()
    return None


# --------------------------------------------------------------------------- #
# Lecture des fichiers (redirection vers Supabase Storage)
# --------------------------------------------------------------------------- #
@router.get("/media/{mid}/file")
def media_file(mid: str, token: str = Query(...)):
    user = user_from_token(token)
    d = get_media_or_404(mid)
    if not visible(d, user):
        raise HTTPException(403, "Contenu réservé aux Pasteurs / Missionnaires / Bergers")
    if not d.get("audio_path"):
        raise HTTPException(404, "Aucun fichier pour ce média")
    signed = sb().storage.from_(MEDIA_BUCKET).create_signed_url(d["audio_path"], SIGNED_URL_TTL)
    return RedirectResponse(signed["signedURL"], status_code=307)


@router.get("/media/{mid}/stream-url")
def media_stream_url(mid: str, user=Depends(current_user)):
    d = get_media_or_404(mid)
    if not visible(d, user):
        raise HTTPException(403, "Contenu réservé aux Pasteurs / Missionnaires / Bergers")
    if not d.get("audio_path"):
        raise HTTPException(404, "Aucun fichier pour ce média")
    signed = sb().storage.from_(MEDIA_BUCKET).create_signed_url(d["audio_path"], SIGNED_URL_TTL)
    return {"url": signed["signedURL"], "expires_in": SIGNED_URL_TTL}


@router.get("/media/{mid}/cover")
def media_cover(mid: str):
    d = get_media_or_404(mid)
    url = cover_public_url(d.get("cover_path"))
    if not url:
        raise HTTPException(404, "Pas de pochette")
    return RedirectResponse(url, status_code=307)


# --------------------------------------------------------------------------- #
# Favoris
# --------------------------------------------------------------------------- #
@router.post("/media/{mid}/favorite", status_code=201)
def add_favorite(mid: str, user=Depends(current_user)):
    get_media_or_404(mid)
    sb().table("favorites").upsert({"user_id": user["id"], "media_id": mid, "created_at": now_iso()},
                                    on_conflict="user_id,media_id").execute()
    return {"ok": True}


@router.delete("/media/{mid}/favorite", status_code=204)
def remove_favorite(mid: str, user=Depends(current_user)):
    sb().table("favorites").delete().eq("user_id", user["id"]).eq("media_id", mid).execute()
    return None


# --------------------------------------------------------------------------- #
# Playlists
# --------------------------------------------------------------------------- #
def to_playlist(d: dict) -> Playlist:
    return Playlist(id=d["id"], user_id=d["user_id"], title=d["title"], description=d.get("description"),
                    item_ids=d.get("item_ids") or [], updated_at=d["updated_at"])


def get_playlist_or_404(pid: str, user: dict) -> dict:
    res = sb().table("playlists").select("*").eq("id", pid).eq("user_id", user["id"]).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Playlist introuvable")
    return res.data[0]


@router.get("/playlists", response_model=List[Playlist])
def list_playlists(user=Depends(current_user)):
    res = sb().table("playlists").select("*").eq("user_id", user["id"]).order("updated_at", desc=True).execute()
    return [to_playlist(d) for d in res.data]


@router.post("/playlists", response_model=Playlist, status_code=201)
def create_playlist(data: PlaylistIn, user=Depends(current_user)):
    if not data.title.strip():
        raise HTTPException(400, "Titre requis")
    row = {"id": new_id(), "user_id": user["id"], "title": data.title.strip(),
           "description": data.description, "item_ids": [], "updated_at": now_iso()}
    res = sb().table("playlists").insert(row).execute()
    return to_playlist(res.data[0])


@router.get("/playlists/{pid}", response_model=Playlist)
def get_playlist(pid: str, user=Depends(current_user)):
    return to_playlist(get_playlist_or_404(pid, user))


@router.patch("/playlists/{pid}", response_model=Playlist)
def update_playlist(pid: str, data: PlaylistIn, user=Depends(current_user)):
    get_playlist_or_404(pid, user)
    res = sb().table("playlists").update({"title": data.title.strip(), "description": data.description,
                                          "updated_at": now_iso()}).eq("id", pid).execute()
    return to_playlist(res.data[0])


@router.delete("/playlists/{pid}", status_code=204)
def delete_playlist(pid: str, user=Depends(current_user)):
    get_playlist_or_404(pid, user)
    sb().table("playlists").delete().eq("id", pid).execute()
    return None


@router.post("/playlists/{pid}/items/{mid}", response_model=Playlist)
def add_to_playlist(pid: str, mid: str, user=Depends(current_user)):
    p = get_playlist_or_404(pid, user)
    get_media_or_404(mid)
    ids = p.get("item_ids") or []
    if mid not in ids:
        ids.append(mid)
    res = sb().table("playlists").update({"item_ids": ids, "updated_at": now_iso()}).eq("id", pid).execute()
    return to_playlist(res.data[0])


@router.delete("/playlists/{pid}/items/{mid}", response_model=Playlist)
def remove_from_playlist(pid: str, mid: str, user=Depends(current_user)):
    p = get_playlist_or_404(pid, user)
    ids = [i for i in (p.get("item_ids") or []) if i != mid]
    res = sb().table("playlists").update({"item_ids": ids, "updated_at": now_iso()}).eq("id", pid).execute()
    return to_playlist(res.data[0])
