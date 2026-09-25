"""Pensée du jour — contenus éditoriaux (Équipe technique + Admin), jamais supprimés automatiquement."""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import EDITORIAL_ROLES, SUPABASE_URL, current_user, new_id, now_iso, require_role, sb

router = APIRouter(prefix="/api")
edit_dep = require_role(*EDITORIAL_ROLES)
BUCKET = "covers"


class Pensee(BaseModel):
    id: str
    theme: str
    texte: Optional[str] = None
    date: str
    image_path: Optional[str] = None
    image_url: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str


class PenseeIn(BaseModel):
    theme: str
    texte: Optional[str] = None
    date: Optional[date] = None
    image_path: Optional[str] = None


class UploadUrlRequest(BaseModel):
    filename: str
    content_type: Optional[str] = None


def _to(d: dict) -> Pensee:
    return Pensee(id=d["id"], theme=d["theme"], texte=d.get("texte"), date=str(d["date"]), image_path=d.get("image_path"),
                  image_url=f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{d['image_path']}" if d.get("image_path") else None,
                  created_by=d.get("created_by"), created_at=d["created_at"])


@router.get("/pensees", response_model=List[Pensee])
def list_pensees(_=Depends(current_user)):
    return [_to(d) for d in sb().table("pensees").select("*").order("date", desc=True).order("created_at", desc=True).limit(365).execute().data]


@router.get("/pensees/today", response_model=Optional[Pensee])
def today(_=Depends(current_user)):
    res = sb().table("pensees").select("*").lte("date", date.today().isoformat()).order("date", desc=True).limit(1).execute()
    return _to(res.data[0]) if res.data else None


@router.post("/pensees/upload-url")
def upload_url(data: UploadUrlRequest, _=Depends(edit_dep)):
    ext = (data.filename.rsplit(".", 1)[-1].lower() if "." in data.filename else "jpg")[:8]
    path = f"pensees/{new_id()}.{ext}"
    signed = sb().storage.from_(BUCKET).create_signed_upload_url(path)
    return {"bucket": BUCKET, "path": path, "upload_url": signed["signed_url"], "token": signed["token"]}


@router.post("/pensees", response_model=Pensee, status_code=201)
def create_pensee(data: PenseeIn, user=Depends(edit_dep)):
    if not data.theme.strip():
        raise HTTPException(400, "Thème requis")
    row = {"id": new_id(), "theme": data.theme.strip(), "texte": (data.texte or "").strip() or None,
           "date": (data.date or date.today()).isoformat(), "image_path": data.image_path,
           "created_by": user["id"], "created_at": now_iso()}
    return _to(sb().table("pensees").insert(row).execute().data[0])


@router.patch("/pensees/{pid}", response_model=Pensee)
def update_pensee(pid: str, data: PenseeIn, _=Depends(edit_dep)):
    updates = {"theme": data.theme.strip(), "texte": (data.texte or "").strip() or None}
    if data.date:
        updates["date"] = data.date.isoformat()
    if data.image_path is not None:
        updates["image_path"] = data.image_path or None
    res = sb().table("pensees").update(updates).eq("id", pid).execute()
    if not res.data:
        raise HTTPException(404, "Pensée introuvable")
    return _to(res.data[0])


@router.delete("/pensees/{pid}", status_code=204)
def delete_pensee(pid: str, _=Depends(edit_dep)):
    res = sb().table("pensees").select("image_path").eq("id", pid).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Pensée introuvable")
    if res.data[0].get("image_path"):
        try:
            sb().storage.from_(BUCKET).remove([res.data[0]["image_path"]])
        except Exception:
            pass
    sb().table("pensees").delete().eq("id", pid).execute()
    return None
