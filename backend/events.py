"""Espace Événements — événements, inscrits/badges, séances, pointage QR, enfants, dashboard, exports."""
import io
import unicodedata
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core import (
    EVENT_ADMIN_ROLES, EVENT_MANAGE_ROLES, PublicUser, current_user, display_name,
    new_id, now_iso, public_user, require_role, sb,
)

router = APIRouter(prefix="/api")
manage_dep = require_role(*EVENT_MANAGE_ROLES)
admin_dep = require_role(*EVENT_ADMIN_ROLES)

PROFILS = ["Membre", "Inconnu", "Prospect Évangélisé", "Prospect Famille", "Externe"]
CATEGORIES_AGE = ["Enfant (-13)", "Gédéon (-18)", "J-30 (18-30)", "CCMG (+30)"]
OFFICIAL_CCMG = [
    "CCMG Angers", "CCMG Brest", "CCMG Châteaubriant", "CCMG La Roche sur Yon",
    "CCMG La Rochelle", "CCMG Le Mans", "CCMG Morlaix", "CCMG Nantes",
    "CCMG Paris", "CCMG Quimper", "CCMG Rennes", "CCMG Saint-Nazaire",
    "CCMG Saumur", "CCMG Tours", "CCMG Vannes - Redon",
]


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


# --------------------------------------------------------------------------- #
# Modèles
# --------------------------------------------------------------------------- #
class Ville(BaseModel):
    id: str
    nom: str


class Evenement(BaseModel):
    id: str
    titre: str
    description: Optional[str] = None
    date: str
    lieu: str
    ville: Optional[str] = None
    type_evenement: str
    intervenants: List[str] = []
    image_url: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str


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


class SessionIn(BaseModel):
    evenement_id: str
    nom: str


class PointageIn(BaseModel):
    evenement_id: str
    badge_id: str


class EnfantsIn(BaseModel):
    evenement_id: str
    delta: int


class PurgeInput(BaseModel):
    evenement_id: str
    confirmation: str
    only_inconnus: bool = False


class SessionPurge(BaseModel):
    session_id: str
    confirmation: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _evt(d: dict) -> Evenement:
    return Evenement(
        id=d["id"], titre=d["titre"], description=d.get("description"), date=d["date"], lieu=d.get("lieu", ""),
        ville=d.get("ville"), type_evenement=d.get("type_evenement", ""), intervenants=d.get("intervenants") or [],
        image_url=d.get("image_url"), created_by=d.get("created_by"), created_at=d["created_at"],
    )


def _participant(d: dict) -> dict:
    d = dict(d)
    d["jours_presence"] = d.get("jours_presence") or []
    return d


def _active_session(evenement_id: str) -> Optional[dict]:
    res = sb().table("event_sessions").select("*").eq("evenement_id", evenement_id).eq("active", True).limit(1).execute()
    return res.data[0] if res.data else None


def _enfants_total(session_id: str) -> int:
    rows = sb().table("event_enfants").select("delta").eq("session_id", session_id).execute().data
    return sum(r["delta"] for r in rows)


def _next_badge_id(evenement_id: str) -> str:
    count = sb().table("event_participants").select("id", count="exact").eq("evenement_id", evenement_id).execute().count or 0
    return f"EBED-{count + 1:04d}"


def _get_event_or_404(eid: str) -> dict:
    res = sb().table("evenements").select("*").eq("id", eid).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Événement introuvable")
    return res.data[0]


def seed_villes():
    existing = {v["nom"] for v in sb().table("villes").select("nom").execute().data}
    missing = [{"id": new_id(), "nom": n} for n in OFFICIAL_CCMG if n not in existing]
    if missing:
        sb().table("villes").insert(missing).execute()


# --------------------------------------------------------------------------- #
# Villes (Églises) & utilisateurs (pour invitations)
# --------------------------------------------------------------------------- #
@router.get("/villes", response_model=List[Ville])
def list_villes(_=Depends(current_user)):
    return [Ville(**v) for v in sb().table("villes").select("*").order("nom").execute().data]


@router.get("/users", response_model=List[PublicUser])
def list_users(_=Depends(current_user)):
    rows = sb().table("users").select("*").eq("disabled", False).order("nom").execute().data
    return [public_user(u) for u in rows]


# --------------------------------------------------------------------------- #
# Événements
# --------------------------------------------------------------------------- #
@router.get("/evenements", response_model=List[Evenement])
def list_evenements(_=Depends(current_user)):
    return [_evt(d) for d in sb().table("evenements").select("*").order("date").execute().data]


@router.get("/evenements/{eid}", response_model=Evenement)
def get_evenement(eid: str, _=Depends(current_user)):
    return _evt(_get_event_or_404(eid))


@router.post("/evenements", response_model=Evenement, status_code=201)
def create_evenement(data: EvenementCreate, user=Depends(manage_dep)):
    row = {"id": new_id(), **data.model_dump(), "date": data.date.isoformat(),
           "created_by": user["id"], "created_at": now_iso()}
    res = sb().table("evenements").insert(row).execute()
    return _evt(res.data[0])


@router.delete("/evenements/{eid}", status_code=204)
def delete_evenement(eid: str, _=Depends(admin_dep)):
    _get_event_or_404(eid)
    sb().table("evenements").delete().eq("id", eid).execute()  # cascade en base
    return None


@router.get("/evenements/{eid}/invitations")
def list_invitations(eid: str, _=Depends(current_user)):
    return sb().table("invitations").select("*").eq("evenement_id", eid).execute().data


@router.post("/invitations", status_code=201)
def invite(data: InvitationCreate, _=Depends(manage_dep)):
    rows = [{"id": new_id(), "evenement_id": data.evenement_id, "user_id": uid, "special": data.special,
             "status": "invited", "created_at": now_iso()} for uid in data.user_ids]
    if not rows:
        return {"created": 0, "total": 0}
    res = sb().table("invitations").upsert(rows, on_conflict="evenement_id,user_id", ignore_duplicates=True).execute()
    return {"created": len(res.data), "total": len(rows)}


# --------------------------------------------------------------------------- #
# Participants
# --------------------------------------------------------------------------- #
@router.get("/event/participants")
def list_participants(evenement_id: str, profil: Optional[str] = None, eglise: Optional[str] = None,
                      q: Optional[str] = None, _=Depends(current_user)):
    qry = sb().table("event_participants").select("*").eq("evenement_id", evenement_id).order("nom")
    if profil:
        qry = qry.eq("profil", profil)
    if eglise:
        qry = qry.eq("eglise", eglise)
    docs = qry.execute().data
    if q:
        s = strip_accents(q)
        docs = [d for d in docs if s in strip_accents(
            f"{d.get('nom','')} {d.get('prenom','')} {d.get('badge_id','')} {d.get('tel') or ''} {d.get('eglise') or ''}")]
    return [_participant(d) for d in docs]


def _insert_participant(data, referent: Optional[str], notes: Optional[str]) -> dict:
    if data.profil not in PROFILS:
        raise HTTPException(400, f"Profil invalide (attendus : {PROFILS})")
    _get_event_or_404(data.evenement_id)
    row = {
        "id": new_id(), "evenement_id": data.evenement_id, "badge_id": _next_badge_id(data.evenement_id),
        "nom": data.nom.strip().upper(), "prenom": data.prenom.strip(), "profil": data.profil,
        "categorie_age": data.categorie_age, "tel": data.tel,
        "email": (data.email or "").strip().lower() or None, "eglise": data.eglise,
        "jours_presence": data.jours_presence, "referent": referent, "notes": notes,
        "sms_status": "none", "wa_status": "none", "created_at": now_iso(),
    }
    return _participant(sb().table("event_participants").insert(row).execute().data[0])


@router.post("/event/participants", status_code=201)
def create_participant(data: ParticipantIn, user=Depends(current_user)):
    return _insert_participant(data, data.referent or display_name(user), data.notes)


class PublicParticipantIn(ParticipantIn):
    pass


@router.post("/event/participants/public", status_code=201)
def public_inscription(data: PublicParticipantIn):
    """Formulaire d'inscription partageable (sans authentification)."""
    return _insert_participant(data, data.referent, None)


@router.get("/event/participants/by-badge/{badge_id}")
def get_by_badge(badge_id: str, evenement_id: str):
    res = sb().table("event_participants").select("*").eq("badge_id", badge_id).eq("evenement_id", evenement_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Badge introuvable")
    return _participant(res.data[0])


@router.post("/event/participants/purge")
def purge_participants(data: PurgeInput, _=Depends(admin_dep)):
    if data.confirmation != "SUPPRIMER":
        raise HTTPException(400, "Confirmation manquante — tapez SUPPRIMER")
    qry = sb().table("event_participants").delete().eq("evenement_id", data.evenement_id)
    if data.only_inconnus:
        qry = qry.eq("profil", "Inconnu")
    return {"deleted": len(qry.execute().data)}


@router.get("/event/participants/{pid}")
def get_participant(pid: str, _=Depends(current_user)):
    res = sb().table("event_participants").select("*").eq("id", pid).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Participant introuvable")
    return _participant(res.data[0])


@router.patch("/event/participants/{pid}")
def update_participant(pid: str, data: ParticipantUpdate, _=Depends(current_user)):
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "nom" in updates:
        updates["nom"] = updates["nom"].strip().upper()
    if "profil" in updates and updates["profil"] not in PROFILS:
        raise HTTPException(400, "Profil invalide")
    res = sb().table("event_participants").update(updates).eq("id", pid).execute()
    if not res.data:
        raise HTTPException(404, "Participant introuvable")
    return _participant(res.data[0])


@router.delete("/event/participants/{pid}", status_code=204)
def delete_participant(pid: str, _=Depends(manage_dep)):
    sb().table("event_participants").delete().eq("id", pid).execute()
    return None


# --------------------------------------------------------------------------- #
# Séances
# --------------------------------------------------------------------------- #
@router.get("/event/sessions")
def list_sessions(evenement_id: str, _=Depends(current_user)):
    return sb().table("event_sessions").select("*").eq("evenement_id", evenement_id).order("started_at", desc=True).execute().data


@router.get("/event/sessions/active")
def get_active_session(evenement_id: str, _=Depends(current_user)):
    return _active_session(evenement_id)


@router.post("/event/sessions/start", status_code=201)
def start_session(data: SessionIn, _=Depends(manage_dep)):
    sb().table("event_sessions").update({"active": False, "ended_at": now_iso()}) \
        .eq("evenement_id", data.evenement_id).eq("active", True).execute()
    row = {"id": new_id(), "evenement_id": data.evenement_id, "nom": data.nom.strip(),
           "active": True, "started_at": now_iso(), "ended_at": None}
    return sb().table("event_sessions").insert(row).execute().data[0]


@router.post("/event/sessions/purge-pointages")
def purge_session_pointages(data: SessionPurge, _=Depends(admin_dep)):
    if data.confirmation != "SUPPRIMER":
        raise HTTPException(400, "Confirmation manquante")
    res = sb().table("event_pointages").delete().eq("session_id", data.session_id).execute()
    return {"deleted": len(res.data)}


@router.post("/event/sessions/{sid}/stop")
def stop_session(sid: str, _=Depends(manage_dep)):
    sb().table("event_sessions").update({"active": False, "ended_at": now_iso()}).eq("id", sid).execute()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Pointages (QR)
# --------------------------------------------------------------------------- #
@router.post("/event/pointages", status_code=201)
def create_pointage(data: PointageIn, user=Depends(current_user)):
    active = _active_session(data.evenement_id)
    if not active:
        raise HTTPException(423, "Aucune séance active — un responsable doit démarrer une séance")
    p = get_by_badge(data.badge_id, data.evenement_id)
    existing = sb().table("event_pointages").select("id").eq("participant_id", p["id"]).eq("session_id", active["id"]).limit(1).execute().data
    if existing:
        return {"status": "already", "participant": p, "session_nom": active["nom"]}
    row = {"id": new_id(), "evenement_id": data.evenement_id, "participant_id": p["id"],
           "session_id": active["id"], "scanned_by": user["email"], "timestamp": now_iso()}
    sb().table("event_pointages").insert(row).execute()
    return {"status": "ok", "participant": p, "session_nom": active["nom"], "timestamp": row["timestamp"]}


@router.get("/event/pointages")
def list_pointages(evenement_id: str, session_id: Optional[str] = None, limit: int = 50, _=Depends(current_user)):
    qry = sb().table("event_pointages").select("*, participant:event_participants(*)") \
        .eq("evenement_id", evenement_id).order("timestamp", desc=True).limit(limit)
    if session_id:
        qry = qry.eq("session_id", session_id)
    return [{"id": d["id"], "timestamp": d["timestamp"], "session_id": d["session_id"],
             "scanned_by": d.get("scanned_by", ""),
             "participant": _participant(d["participant"]) if d.get("participant") else None}
            for d in qry.execute().data]


# --------------------------------------------------------------------------- #
# Compteur enfants
# --------------------------------------------------------------------------- #
@router.post("/event/enfants")
def add_enfants(data: EnfantsIn, user=Depends(current_user)):
    active = _active_session(data.evenement_id)
    if not active:
        raise HTTPException(423, "Aucune séance active")
    sb().table("event_enfants").insert({"id": new_id(), "evenement_id": data.evenement_id, "session_id": active["id"],
                                        "delta": data.delta, "by": user["email"], "timestamp": now_iso()}).execute()
    return {"total": _enfants_total(active["id"]), "session_id": active["id"], "session_nom": active["nom"]}


@router.get("/event/enfants")
def get_enfants(evenement_id: str, session_id: Optional[str] = None, _=Depends(current_user)):
    if not session_id:
        active = _active_session(evenement_id)
        if not active:
            return {"total": 0, "session_id": None, "session_nom": None}
        return {"total": _enfants_total(active["id"]), "session_id": active["id"], "session_nom": active["nom"]}
    res = sb().table("event_sessions").select("nom").eq("id", session_id).limit(1).execute().data
    return {"total": _enfants_total(session_id), "session_id": session_id, "session_nom": res[0]["nom"] if res else None}


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
@router.get("/event/dashboard")
def dashboard(evenement_id: str, _=Depends(current_user)):
    parts = sb().table("event_participants").select("*").eq("evenement_id", evenement_id).execute().data
    active = _active_session(evenement_id)

    by_profil = {p: 0 for p in PROFILS}
    by_age = {c: 0 for c in CATEGORIES_AGE}
    by_eglise: dict = {}
    for p in parts:
        by_profil[p.get("profil") or "Externe"] = by_profil.get(p.get("profil") or "Externe", 0) + 1
        if p.get("categorie_age"):
            by_age[p["categorie_age"]] = by_age.get(p["categorie_age"], 0) + 1
        e = p.get("eglise") or "—"
        by_eglise[e] = by_eglise.get(e, 0) + 1

    presence: dict = {"total": 0, "membres": 0, "vip": 0, "prospects": 0, "externes": 0, "inconnus": 0,
                      "gedeon": 0, "j30": 0, "ccmg": 0, "enfants_pointes": 0, "by_eglise": {}}
    enfants_total = 0
    if active:
        pointages = sb().table("event_pointages").select("participant_id").eq("session_id", active["id"]).execute().data
        pids = {pt["participant_id"] for pt in pointages}
        presence["total"] = len(pointages)
        for p in parts:
            if p["id"] not in pids:
                continue
            prof = p.get("profil") or "Externe"
            if prof == "Membre": presence["membres"] += 1
            elif prof == "Inconnu": presence["inconnus"] += 1
            elif prof.startswith("Prospect"): presence["prospects"] += 1
            elif prof == "Externe": presence["externes"] += 1
            if "VIP" in (p.get("notes") or "").upper():
                presence["vip"] += 1
            cage = p.get("categorie_age") or ""
            if cage.startswith("Gédéon"): presence["gedeon"] += 1
            elif cage.startswith("J-30"): presence["j30"] += 1
            elif cage.startswith("CCMG"): presence["ccmg"] += 1
            elif cage.startswith("Enfant"): presence["enfants_pointes"] += 1
            e = p.get("eglise") or "—"
            presence["by_eglise"][e] = presence["by_eglise"].get(e, 0) + 1
        enfants_total = _enfants_total(active["id"])

    return {
        "total": len(parts), "by_profil": by_profil, "by_age": by_age, "by_eglise": by_eglise,
        "active_session": active, "pointages_active_session": presence["total"],
        "enfants_active_session": enfants_total, "presence": presence,
    }


# --------------------------------------------------------------------------- #
# Exports
# --------------------------------------------------------------------------- #
@router.get("/event/exports/participants.csv")
def export_participants_csv(evenement_id: str, _=Depends(current_user)):
    docs = sb().table("event_participants").select("*").eq("evenement_id", evenement_id).order("nom").execute().data
    lines = ["badge_id,nom,prenom,profil,eglise,tel,email,referent,jours_presence,sms_status,wa_status,created_at"]
    for d in docs:
        row = [d.get("badge_id", ""), d.get("nom", ""), d.get("prenom", ""), d.get("profil", ""),
               d.get("eglise") or "", d.get("tel") or "", d.get("email") or "", d.get("referent") or "",
               "|".join(d.get("jours_presence") or []), d.get("sms_status", "none"), d.get("wa_status", "none"),
               d.get("created_at", "")]
        lines.append(",".join('"' + str(c).replace('"', '""') + '"' for c in row))
    return StreamingResponse(io.BytesIO("\n".join(lines).encode("utf-8")), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="participants.csv"'})


def _table(rows, col_widths=None) -> Table:
    t = Table(rows, hAlign="LEFT", colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0047AB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CBD5E1")),
    ]))
    return t


@router.get("/event/exports/bilan.pdf")
def export_bilan_pdf(evenement_id: str, _=Depends(current_user)):
    evt = _get_event_or_404(evenement_id)
    parts = sb().table("event_participants").select("profil").eq("evenement_id", evenement_id).execute().data
    sessions = sb().table("event_sessions").select("*").eq("evenement_id", evenement_id).order("started_at").execute().data

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("<b>UDAMG</b> — Rapport Bilan Pastoral", styles["Title"]),
        Paragraph(f"<b>{evt.get('titre', '')}</b>", styles["Heading2"]),
        Paragraph(f"Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 0.4*cm),
        Paragraph(f"<b>Total inscrits :</b> {len(parts)}", styles["Normal"]),
    ]
    by_profil = {p: 0 for p in PROFILS}
    for p in parts:
        by_profil[p.get("profil") or "Externe"] = by_profil.get(p.get("profil") or "Externe", 0) + 1
    story += [Spacer(1, 0.4*cm), Paragraph("<b>Répartition par profil</b>", styles["Heading3"]),
              _table([["Profil", "Nombre"]] + [[p, str(v)] for p, v in by_profil.items()], [8*cm, 3*cm])]
    if sessions:
        rows = [["Séance", "Statut", "Pointages", "Enfants"]]
        for s in sessions:
            pcount = sb().table("event_pointages").select("id", count="exact").eq("session_id", s["id"]).execute().count or 0
            rows.append([s["nom"], "Active" if s.get("active") else "Terminée", str(pcount), str(_enfants_total(s["id"]))])
        story += [Spacer(1, 0.4*cm), Paragraph("<b>Séances & pointages</b>", styles["Heading3"]), _table(rows)]
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="bilan_{evenement_id}.pdf"'})
