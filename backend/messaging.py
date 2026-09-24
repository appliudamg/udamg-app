"""Messagerie — canal de diffusion unidirectionnel (ADMIN / ÉQUIPE TECHNIQUE → tous) avec suivi de lecture."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import MESSAGE_SEND_ROLES, current_user, display_name, new_id, now_iso, require_role, sb

router = APIRouter(prefix="/api")
send_dep = require_role(*MESSAGE_SEND_ROLES)


class MessageIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    body: str = Field(min_length=1, max_length=5000)


class Message(BaseModel):
    id: str
    sender_id: Optional[str] = None
    sender_name: str
    title: str
    body: str
    created_at: str
    read: bool = False
    read_at: Optional[str] = None
    read_count: int = 0
    recipients_count: int = 0


class ReadEntry(BaseModel):
    user_id: str
    nom: str
    prenom: str
    email: str
    role: str
    read_at: Optional[str] = None


def _recipients() -> List[dict]:
    return sb().table("users").select("id,nom,prenom,email,role").eq("disabled", False).eq("is_approved", True).execute().data


def _to_message(d: dict, my_read: Optional[dict], read_count: int, recipients: int) -> Message:
    return Message(
        id=d["id"], sender_id=d.get("sender_id"), sender_name=d.get("sender_name", ""),
        title=d["title"], body=d["body"], created_at=d["created_at"],
        read=my_read is not None, read_at=my_read["read_at"] if my_read else None,
        read_count=read_count, recipients_count=recipients,
    )


@router.get("/messages", response_model=List[Message])
def list_messages(user=Depends(current_user)):
    msgs = sb().table("messages").select("*").order("created_at", desc=True).limit(200).execute().data
    if not msgs:
        return []
    ids = [m["id"] for m in msgs]
    reads = sb().table("message_reads").select("message_id,user_id,read_at").in_("message_id", ids).execute().data
    mine = {r["message_id"]: r for r in reads if r["user_id"] == user["id"]}
    counts: dict = {}
    for r in reads:
        counts[r["message_id"]] = counts.get(r["message_id"], 0) + 1
    recipients = len(_recipients()) if user["role"] in MESSAGE_SEND_ROLES else 0
    return [_to_message(m, mine.get(m["id"]), counts.get(m["id"], 0), recipients) for m in msgs]


@router.get("/messages/unread-count")
def unread_count(user=Depends(current_user)):
    total = sb().table("messages").select("id", count="exact").execute().count or 0
    read = sb().table("message_reads").select("message_id", count="exact").eq("user_id", user["id"]).execute().count or 0
    return {"unread": max(0, total - read)}


@router.post("/messages", response_model=Message, status_code=201)
def send_message(data: MessageIn, user=Depends(send_dep)):
    row = {"id": new_id(), "sender_id": user["id"], "sender_name": display_name(user),
           "title": data.title.strip(), "body": data.body.strip(), "created_at": now_iso()}
    res = sb().table("messages").insert(row).execute()
    return _to_message(res.data[0], None, 0, len(_recipients()))


def _get_message(mid: str) -> dict:
    res = sb().table("messages").select("*").eq("id", mid).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Message introuvable")
    return res.data[0]


@router.get("/messages/{mid}", response_model=Message)
def get_message(mid: str, user=Depends(current_user)):
    m = _get_message(mid)
    reads = sb().table("message_reads").select("user_id,read_at").eq("message_id", mid).execute().data
    mine = next((r for r in reads if r["user_id"] == user["id"]), None)
    recipients = len(_recipients()) if user["role"] in MESSAGE_SEND_ROLES else 0
    return _to_message(m, mine, len(reads), recipients)


@router.post("/messages/{mid}/read", response_model=Message)
def mark_read(mid: str, user=Depends(current_user)):
    m = _get_message(mid)
    sb().table("message_reads").upsert(
        {"message_id": mid, "user_id": user["id"], "read_at": now_iso()},
        on_conflict="message_id,user_id", ignore_duplicates=True,
    ).execute()
    reads = sb().table("message_reads").select("user_id,read_at").eq("message_id", mid).execute().data
    mine = next((r for r in reads if r["user_id"] == user["id"]), None)
    return _to_message(m, mine, len(reads), 0)


@router.get("/messages/{mid}/reads")
def message_reads(mid: str, _=Depends(send_dep)):
    """Suivi de lecture (temps réel via polling côté client) : qui a lu / pas encore lu."""
    _get_message(mid)
    reads = {r["user_id"]: r["read_at"] for r in
             sb().table("message_reads").select("user_id,read_at").eq("message_id", mid).execute().data}
    seen, unseen = [], []
    for u in _recipients():
        entry = ReadEntry(user_id=u["id"], nom=u.get("nom", ""), prenom=u.get("prenom", ""),
                          email=u["email"], role=u["role"], read_at=reads.get(u["id"]))
        (seen if u["id"] in reads else unseen).append(entry)
    seen.sort(key=lambda e: e.read_at or "", reverse=True)
    unseen.sort(key=lambda e: (e.nom, e.prenom))
    return {"read": seen, "unread": unseen, "read_count": len(seen), "recipients_count": len(seen) + len(unseen)}


@router.delete("/messages/{mid}", status_code=204)
def delete_message(mid: str, _=Depends(send_dep)):
    _get_message(mid)
    sb().table("messages").delete().eq("id", mid).execute()
    return None
