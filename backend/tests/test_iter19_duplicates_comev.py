"""Iter19 — tests for:
  (1) Blocking duplicate detection on participants (/me, /other, /public, admin POST)
      and admin user creation (email, nom+prenom).
  (2) Admin can create media (POST /api/media/create-json).
  (3) New 'comev' role: can start sessions, cannot list /admin/users.
  (4) System messages for event create/delete and pensée du jour (with action_url).
  (5) GET /api/media/categories includes 'louange'.
  (6) POST /api/evenements/image-upload-url gated (admin ok, membre 403).

Run:
  pytest -o addopts='' /app/backend/tests/test_iter19_duplicates_comev.py -v \
      --junitxml=/app/test_reports/pytest/pytest_iter19.xml
"""
import os
import re
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://church-connect-255.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin":   ("admin@udamg.app",      "AdminUdamg2026!"),
    "pasteur": ("pasteur@udamg.app",    "PasteurUdamg2026!"),
    "membre":  ("membre@udamg.app",     "MembreUdamg2026!"),
    "comev":   ("comev.test@example.com", "ComevTest2026!"),
}

CREATED = {
    "participants": [],
    "users": [],
    "evenements": [],
    "pensees": [],
    "media": [],
    "sessions": [],
    "messages": [],
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


@pytest.fixture(scope="module")
def event_id(tokens):
    r = requests.get(f"{API}/evenements", headers=H(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    evts = r.json()
    for e in evts:
        if "MJAC" in (e.get("titre") or ""):
            return e["id"]
    return evts[0]["id"]


# --------------------------------------------------------------------------- #
# Final cleanup
# --------------------------------------------------------------------------- #
def _cleanup(tokens):
    hA = H(tokens["admin"])
    for pid in CREATED["participants"]:
        try:
            requests.delete(f"{API}/event/participants/{pid}", headers=hA, timeout=15)
        except Exception:
            pass
    for mid in CREATED["messages"]:
        try:
            requests.delete(f"{API}/messages/{mid}", headers=hA, timeout=15)
        except Exception:
            pass
    for eid in CREATED["evenements"]:
        try:
            requests.delete(f"{API}/evenements/{eid}", headers=hA, timeout=15)
        except Exception:
            pass
    for pid in CREATED["pensees"]:
        try:
            requests.delete(f"{API}/pensees/{pid}", headers=hA, timeout=15)
        except Exception:
            pass
    for mid in CREATED["media"]:
        try:
            requests.delete(f"{API}/media/{mid}", headers=hA, timeout=15)
        except Exception:
            pass
    for uid in CREATED["users"]:
        try:
            requests.delete(f"{API}/admin/users/{uid}", headers=hA, timeout=15)
        except Exception:
            pass


@pytest.fixture(scope="module", autouse=True)
def _teardown(tokens):
    yield
    _cleanup(tokens)


# ========================================================================= #
# (1a) Duplicate detection on participants
# ========================================================================= #
class TestParticipantDuplicates:
    def test_01_other_create_initial(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "nom": "Dupont19", "prenom": "Éric",
            "email": "test19_dup1@example.com",
            "tel": "06 11 22 33 44",
            "profil": "Externe",
        }, timeout=60)
        assert r.status_code == 201, f"expected 201, got {r.status_code}: {r.text}"
        d = r.json()
        assert re.match(r"^EBED-\d{4}$", d["badge_id"])
        CREATED["participants"].append(d["id"])
        pytest.base_pid = d["id"]

    def test_02_dup_by_name_insensitive_accents_case(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "nom": "DUPONT19", "prenom": "eric",
            "email": "test19_different@example.com",
            "profil": "Externe",
        }, timeout=30)
        assert r.status_code == 409, f"expected 409 for nom+prenom dup, got {r.status_code}: {r.text}"
        assert "Doublon" in r.text and ("nom" in r.text.lower() or "prénom" in r.text.lower())

    def test_03_dup_by_email(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "nom": "TEST19_Autre", "prenom": "Alpha",
            "email": "test19_dup1@example.com",
            "profil": "Externe",
        }, timeout=30)
        assert r.status_code == 409
        assert "email" in r.text.lower()

    def test_04_dup_by_tel_normalized(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "nom": "TEST19_Beta", "prenom": "Gamma",
            "email": "test19_newmail@example.com",
            "tel": "0611223344",  # same digits as "06 11 22 33 44"
            "profil": "Externe",
        }, timeout=30)
        assert r.status_code == 409
        assert "téléphone" in r.text.lower() or "telephone" in r.text.lower()

    def test_05_public_dup_by_email(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/public", json={
            "evenement_id": event_id,
            "nom": "TEST19_Public", "prenom": "Delta",
            "email": "test19_dup1@example.com",
            "profil": "Externe",
        }, timeout=30)
        assert r.status_code == 409, f"public should 409 on same email, got {r.status_code}"

    def test_06_admin_post_dup(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants", headers=H(tokens["admin"]), json={
            "evenement_id": event_id,
            "nom": "Dupont19", "prenom": "ERIC",
            "profil": "Externe",
        }, timeout=30)
        assert r.status_code == 409

    def test_07_me_duplicate_against_existing_other(self, tokens, event_id):
        # Check membre info first
        me = requests.get(f"{API}/auth/me", headers=H(tokens["membre"]), timeout=10).json()
        # Ensure not already registered
        g = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                         headers=H(tokens["membre"]), timeout=10)
        if g.json():
            requests.delete(f"{API}/event/participants/me/{g.json()['id']}",
                            headers=H(tokens["membre"]), timeout=10)
        # Register /me — should 201 (membre email differs from test19_dup1)
        r = requests.post(f"{API}/event/participants/me", headers=H(tokens["membre"]), json={
            "evenement_id": event_id, "profil": "Membre", "eglise": "CCMG",
        }, timeout=60)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        pid = r.json()["id"]
        # Cleanup immediately
        d = requests.delete(f"{API}/event/participants/me/{pid}", headers=H(tokens["membre"]), timeout=10)
        assert d.status_code == 204


# ========================================================================= #
# (1b) Duplicate detection on admin user creation
# ========================================================================= #
class TestUserDuplicates:
    def test_10_dup_email_comev(self, tokens):
        r = requests.post(f"{API}/admin/users", headers=H(tokens["admin"]), json={
            "email": "comev.test@example.com",
            "nom": "NouveauNom", "prenom": "AutrePrenom",
            "role": "membre", "password": "Abcdef12!",
        }, timeout=30)
        assert r.status_code == 409
        assert "email" in r.text.lower() or "doublon" in r.text.lower()

    def test_11_dup_nom_prenom(self, tokens):
        r = requests.post(f"{API}/admin/users", headers=H(tokens["admin"]), json={
            "email": "test19_newuser_different@example.com",
            "nom": "COMEV", "prenom": "test",   # matches existing 'Comev' 'Test' (accents/case insensitive)
            "role": "membre", "password": "Abcdef12!",
        }, timeout=30)
        assert r.status_code == 409

    def test_12_create_valid_then_delete(self, tokens):
        r = requests.post(f"{API}/admin/users", headers=H(tokens["admin"]), json={
            "email": "test19_comev2@example.com",
            "nom": "TEST19", "prenom": "ComevTwo",
            "role": "comev", "password": "Abcdef12!",
        }, timeout=30)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        uid = r.json()["id"]
        assert r.json()["role"] == "comev"
        CREATED["users"].append(uid)
        # listing accepts comev role
        lst = requests.get(f"{API}/admin/users", headers=H(tokens["admin"]), timeout=15).json()
        assert any(u["id"] == uid and u["role"] == "comev" for u in lst)
        # delete it
        d = requests.delete(f"{API}/admin/users/{uid}", headers=H(tokens["admin"]), timeout=15)
        assert d.status_code == 204
        CREATED["users"].remove(uid)


# ========================================================================= #
# (3) Admin creates media / COMEV sessions + 403 on /admin/users / categories
# ========================================================================= #
class TestRolesAndCategories:
    def test_20_media_categories_includes_louange(self, tokens):
        r = requests.get(f"{API}/media/categories", headers=H(tokens["membre"]), timeout=15)
        assert r.status_code == 200
        payload = r.json()
        cats = payload.get("categories") if isinstance(payload, dict) else payload
        keys = [c.get("key") for c in cats]
        assert "louange" in keys, f"louange missing from {keys}"

    def test_21_admin_creates_media(self, tokens):
        r = requests.post(f"{API}/media/create-json", headers=H(tokens["admin"]), json={
            "title": "TEST19_media_admin", "author": "TestAuthor",
            "category": "louange", "kind": "audio",
        }, timeout=30)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        mid = r.json()["id"]
        CREATED["media"].append(mid)
        # cleanup now
        d = requests.delete(f"{API}/media/{mid}", headers=H(tokens["admin"]), timeout=15)
        assert d.status_code == 204
        CREATED["media"].remove(mid)

    def test_22_comev_can_start_and_stop_session(self, tokens, event_id):
        r = requests.post(f"{API}/event/sessions/start", headers=H(tokens["comev"]), json={
            "evenement_id": event_id, "nom": "TEST19_session_comev",
        }, timeout=15)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        sid = r.json()["id"]
        r2 = requests.post(f"{API}/event/sessions/{sid}/stop", headers=H(tokens["comev"]), timeout=15)
        assert r2.status_code == 200

    def test_23_comev_cannot_list_admin_users(self, tokens):
        r = requests.get(f"{API}/admin/users", headers=H(tokens["comev"]), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"


# ========================================================================= #
# (4) Automatic system messages
# ========================================================================= #
class TestSystemMessages:
    def test_30_evenement_create_broadcasts_message(self, tokens):
        future = (datetime.now(timezone.utc) + timedelta(days=120)).replace(microsecond=0).isoformat()
        r = requests.post(f"{API}/evenements", headers=H(tokens["admin"]), json={
            "titre": "TEST19 AUTO MSG",
            "date": future,
            "lieu": "Salle TEST19",
            "type_evenement": "conference",
            "description": "A test description",
        }, timeout=30)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        eid = r.json()["id"]
        CREATED["evenements"].append(eid)
        pytest.evt_id = eid
        # fetch messages as membre
        msgs = requests.get(f"{API}/messages", headers=H(tokens["membre"]), timeout=15).json()
        hits = [m for m in msgs if (m.get("title") or "") == "Nouvel événement : TEST19 AUTO MSG"]
        assert hits, f"message 'Nouvel événement : TEST19 AUTO MSG' not found"
        m = hits[0]
        assert m.get("action_url") == f"/(app)/evenements/{eid}", f"bad action_url {m.get('action_url')}"
        pytest.msg_create_id = m["id"]
        CREATED["messages"].append(m["id"])

    def test_31_patch_evenement_titre(self, tokens):
        r = requests.patch(f"{API}/evenements/{pytest.evt_id}", headers=H(tokens["admin"]),
                           json={"titre": "TEST19 AUTO MSG 2"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["titre"] == "TEST19 AUTO MSG 2"

    def test_32_delete_evenement_broadcasts_cancel(self, tokens):
        r = requests.delete(f"{API}/evenements/{pytest.evt_id}", headers=H(tokens["admin"]), timeout=20)
        assert r.status_code == 204
        try:
            CREATED["evenements"].remove(pytest.evt_id)
        except ValueError:
            pass
        msgs = requests.get(f"{API}/messages", headers=H(tokens["membre"]), timeout=15).json()
        hits = [m for m in msgs if (m.get("title") or "") == "Événement annulé : TEST19 AUTO MSG 2"]
        assert hits, "message 'Événement annulé : TEST19 AUTO MSG 2' not found"
        CREATED["messages"].append(hits[0]["id"])

    def test_33_pensee_creates_message_with_action_url(self, tokens):
        r = requests.post(f"{API}/pensees", headers=H(tokens["admin"]), json={
            "theme": "TEST19 PENSEE", "texte": "Un contenu test",
        }, timeout=20)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        pid = r.json()["id"]
        CREATED["pensees"].append(pid)
        msgs = requests.get(f"{API}/messages", headers=H(tokens["membre"]), timeout=15).json()
        hits = [m for m in msgs if (m.get("title") or "") == "Pensée du jour : TEST19 PENSEE"]
        assert hits, "message 'Pensée du jour : TEST19 PENSEE' not found"
        m = hits[0]
        assert m.get("action_url") == f"/(app)/media/pensees?open={pid}", f"bad action_url {m.get('action_url')}"
        CREATED["messages"].append(m["id"])


# ========================================================================= #
# (6) Event image upload URL
# ========================================================================= #
class TestEventImageUpload:
    def test_40_admin_can_sign(self, tokens):
        r = requests.post(f"{API}/evenements/image-upload-url", headers=H(tokens["admin"]),
                          json={"filename": "a.jpg"}, timeout=15)
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        j = r.json()
        assert "upload_url" in j and "public_url" in j
        assert j["upload_url"].startswith("http")
        assert j["public_url"].startswith("http")

    def test_41_membre_forbidden(self, tokens):
        r = requests.post(f"{API}/evenements/image-upload-url", headers=H(tokens["membre"]),
                          json={"filename": "a.jpg"}, timeout=15)
        assert r.status_code == 403
