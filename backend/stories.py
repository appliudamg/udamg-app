"""Stories éphémères (24 h) — publication réservée à l'Équipe technique."""
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import MEDIA_WRITE_ROLES, SUPABASE_URL, current_user, new_id, now_iso, require_role, sb

router = APIRouter(prefix="/api")
write_dep = require_role(*MEDIA_WRITE_ROLES)
BUCKET = "stories"


class Story(BaseModel):
    id: str
    kind: Literal["image", "video"]
    media_path: Optional[str] = None
    url: Optional[str] = None
    caption: Optional[str] = None
    created_by: Optional[str] = None
    author_name: str = ""
    created_at: str
    expires_at: str
    viewed: bool = False
    views_count: int = 0


class StoryCreate(BaseModel):
    kind: Literal["image", "video"]
    caption: Optional[str] = None
    duration_hours: int = 24


class StoryUpdate(BaseModel):
    caption: Optional[str] = None


class UploadUrlRequest(BaseModel):
    filename: str
    content_type: Optional[str] = None


class ConfirmUpload(BaseModel):
    path: str


def _url(path: Optional[str]) -> Optional[str]:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}" if path else None


def _get(sid: str) -> dict:
    res = sb().table("stories").select("*").eq("id", sid).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Story introuvable")
    return res.data[0]


def _to_story(d: dict, viewed: bool, views: int, author: str) -> Story:
    return Story(id=d["id"], kind=d["kind"], media_path=d.get("media_path"), url=_url(d.get("media_path")),
                 caption=d.get("caption"), created_by=d.get("created_by"), author_name=author,
                 created_at=d["created_at"], expires_at=d["expires_at"], viewed=viewed, views_count=views)


@router.get("/stories", response_model=List[Story])
def list_stories(user=Depends(current_user)):
    rows = (sb().table("stories").select("*").gt("expires_at", now_iso()).not_.is_("media_path", "null")
            .order("created_at").execute().data)
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    views = sb().table("story_views").select("story_id,user_id").in_("story_id", ids).execute().data
    counts: dict = {}
    mine = set()
    for v in views:
        counts[v["story_id"]] = counts.get(v["story_id"], 0) + 1
        if v["user_id"] == user["id"]:
            mine.add(v["story_id"])
    author_ids = list({r["created_by"] for r in rows if r.get("created_by")})
    authors = {u["id"]: f"{u.get('prenom', '')} {u.get('nom', '')}".strip()
               for u in sb().table("users").select("id,prenom,nom").in_("id", author_ids).execute().data} if author_ids else {}
    return [_to_story(r, r["id"] in mine, counts.get(r["id"], 0), authors.get(r.get("created_by"), "UDAMG")) for r in rows]


@router.post("/stories/create-json", response_model=Story, status_code=201)
def create_story(data: StoryCreate, user=Depends(write_dep)):
    hours = max(1, min(data.duration_hours, 24 * 7))
    row = {"id": new_id(), "kind": data.kind, "caption": (data.caption or "").strip() or None,
           "created_by": user["id"], "created_at": now_iso(),
           "expires_at": (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()}
    res = sb().table("stories").insert(row).execute()
    return _to_story(res.data[0], False, 0, f"{user.get('prenom', '')} {user.get('nom', '')}".strip())


@router.post("/stories/{sid}/upload-url")
def story_upload_url(sid: str, data: UploadUrlRequest, _=Depends(write_dep)):
    _get(sid)
    ext = (data.filename.rsplit(".", 1)[-1].lower() if "." in data.filename else "bin")[:8]
    path = f"{sid}/story-{new_id()[:8]}.{ext}"
    signed = sb().storage.from_(BUCKET).create_signed_upload_url(path)
    return {"bucket": BUCKET, "path": path, "upload_url": signed["signed_url"], "token": signed["token"]}


@router.post("/stories/{sid}/confirm", response_model=Story)
def story_confirm(sid: str, data: ConfirmUpload, user=Depends(write_dep)):
    d = _get(sid)
    if d.get("media_path") and d["media_path"] != data.path:
        try:
            sb().storage.from_(BUCKET).remove([d["media_path"]])
        except Exception:
            pass
    res = sb().table("stories").update({"media_path": data.path}).eq("id", sid).execute()
    return _to_story(res.data[0], False, 0, f"{user.get('prenom', '')} {user.get('nom', '')}".strip())


@router.patch("/stories/{sid}", response_model=Story)
def story_update(sid: str, data: StoryUpdate, user=Depends(write_dep)):
    _get(sid)
    res = sb().table("stories").update({"caption": (data.caption or "").strip() or None}).eq("id", sid).execute()
    return _to_story(res.data[0], False, 0, "")


@router.delete("/stories/{sid}", status_code=204)
def story_delete(sid: str, _=Depends(write_dep)):
    d = _get(sid)
    if d.get("media_path"):
        try:
            sb().storage.from_(BUCKET).remove([d["media_path"]])
        except Exception:
            pass
    sb().table("stories").delete().eq("id", sid).execute()
    return None


@router.post("/stories/{sid}/view")
def story_view(sid: str, user=Depends(current_user)):
    _get(sid)
    sb().table("story_views").upsert({"story_id": sid, "user_id": user["id"], "viewed_at": now_iso()},
                                      on_conflict="story_id,user_id", ignore_duplicates=True).execute()
    return {"ok": True}


@router.get("/stories/{sid}/viewers")
def story_viewers(sid: str, _=Depends(write_dep)):
    _get(sid)
    views = sb().table("story_views").select("user_id,viewed_at").eq("story_id", sid).order("viewed_at", desc=True).execute().data
    ids = [v["user_id"] for v in views]
    users = {u["id"]: u for u in sb().table("users").select("id,prenom,nom,role").in_("id", ids).execute().data} if ids else {}
    return [{"user_id": v["user_id"], "viewed_at": v["viewed_at"],
             "name": f"{users.get(v['user_id'], {}).get('prenom', '')} {users.get(v['user_id'], {}).get('nom', '')}".strip(),
             "role": users.get(v["user_id"], {}).get("role", "")} for v in views]
