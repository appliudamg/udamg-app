"""Migration ponctuelle : MongoDB local (Emergent) → Supabase (compte UDAMG).
Usage : EMERGENT_LLM_KEY=... python scripts/migrate_from_mongo.py
"""
import os
import sys
from datetime import datetime

import requests
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import ROLE_MEMBRE, ROLE_OUVRIER, ROLE_PASTEUR, ROLE_ADMIN, now_iso, sb  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
db = MongoClient(MONGO_URL)["udamg_db"]
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

ROLE_MAP = {"pasteur": ROLE_ADMIN, "ouvrier": ROLE_OUVRIER, "evangeliste": ROLE_OUVRIER, "membre": ROLE_MEMBRE}
CATEGORY_MAP = {"Enseignements du Dimanche": ("culte_dimanche", None), "Podcasts": ("podcasts", None)}


def iso(v):
    return v.isoformat() if isinstance(v, datetime) else (v or now_iso())


def fetch_emergent(path: str) -> tuple[bytes, str]:
    key = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30).json()["storage_key"]
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=300)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def migrate_users():
    existing = {u["email"] for u in sb().table("users").select("email").execute().data}
    rows = []
    for u in db.users.find({}):
        if u["email"] in existing:
            continue
        rows.append({"id": u["_id"], "email": u["email"], "nom": u.get("nom", ""), "prenom": u.get("prenom", ""),
                     "role": ROLE_MAP.get(u["role"], ROLE_MEMBRE), "password_hash": u["password_hash"],
                     "is_approved": u.get("is_approved", True), "disabled": u.get("disabled", False),
                     "created_at": iso(u.get("created_at"))})
    if rows:
        sb().table("users").insert(rows).execute()
    print(f"users: {len(rows)} migrés")


def migrate_media():
    existing = {m["id"] for m in sb().table("media_items").select("id").execute().data}
    n = 0
    for m in db.media_items.find({}):
        if m["_id"] in existing:
            continue
        cat, sub = CATEGORY_MAP.get(m.get("category"), ("enseignements", None))
        row = {"id": m["_id"], "title": m["title"], "author": m.get("author", ""), "category": cat, "subcategory": sub,
               "kind": "video" if m.get("kind") == "video" else "audio", "duration": m.get("duration"),
               "description": m.get("description"), "transcript": m.get("transcript"),
               "created_at": iso(m.get("created_at")), "audio_path": None, "cover_path": None}
        for field, bucket, col in (("audio_path", "media", "audio_path"), ("cover_path", "covers", "cover_path")):
            src = m.get(field)
            if not src or not EMERGENT_KEY:
                continue
            try:
                data, ctype = fetch_emergent(src)
                ext = src.rsplit(".", 1)[-1]
                dest = f"{m['_id']}/{'audio' if field == 'audio_path' else 'cover'}.{ext}"
                sb().storage.from_(bucket).upload(dest, data, {"content-type": ctype, "upsert": "true"})
                row[col] = dest
                print(f"  fichier copié → {bucket}/{dest} ({len(data)//1024} Ko)")
            except Exception as e:
                print(f"  ! fichier {src} non copié : {e}")
        sb().table("media_items").insert(row).execute()
        n += 1
    print(f"media_items: {n} migrés")


def migrate_events():
    user_ids = {u["id"] for u in sb().table("users").select("id").execute().data}
    ev_existing = {e["id"] for e in sb().table("evenements").select("id").execute().data}
    evs = [{"id": e["_id"], "titre": e["titre"], "description": e.get("description"), "date": iso(e["date"]),
            "lieu": e.get("lieu", ""), "ville": e.get("ville"), "type_evenement": e.get("type_evenement", ""),
            "intervenants": e.get("intervenants", []), "image_url": e.get("image_url"),
            "created_by": e.get("created_by") if e.get("created_by") in user_ids else None,
            "created_at": iso(e.get("created_at"))}
           for e in db.evenements.find({}) if e["_id"] not in ev_existing]
    if evs:
        sb().table("evenements").insert(evs).execute()
    parts = [{"id": p["_id"], "evenement_id": p["evenement_id"], "badge_id": p["badge_id"], "nom": p["nom"],
              "prenom": p["prenom"], "profil": p.get("profil", "Externe"), "categorie_age": p.get("categorie_age"),
              "tel": p.get("tel"), "email": p.get("email"), "eglise": p.get("eglise"),
              "jours_presence": p.get("jours_presence", []), "referent": p.get("referent"), "notes": p.get("notes"),
              "sms_status": p.get("sms_status", "none"), "wa_status": p.get("wa_status", "none"),
              "created_at": iso(p.get("created_at"))} for p in db.event_participants.find({})]
    if parts:
        sb().table("event_participants").upsert(parts).execute()
    sess = [{"id": s["_id"], "evenement_id": s["evenement_id"], "nom": s["nom"], "active": s.get("active", False),
             "started_at": iso(s["started_at"]), "ended_at": iso(s["ended_at"]) if s.get("ended_at") else None}
            for s in db.event_sessions.find({})]
    if sess:
        sb().table("event_sessions").upsert(sess).execute()
    print(f"evenements: {len(evs)}, participants: {len(parts)}, séances: {len(sess)}")


if __name__ == "__main__":
    migrate_users()
    migrate_media()
    migrate_events()
    print("Migration terminée.")
