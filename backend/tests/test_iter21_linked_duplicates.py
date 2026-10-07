"""Iter21 — tests for:
  (A) POST /event/participants/me rattache l'inscription publique orpheline (même email) → linked:true, badge inchangé.
  (B) POST /event/participants/me après DELETE /me/{pid} → 201 normal sans linked.
  (C) POST /event/participants/other doublon (nom+prenom existant) → 409 ; valide → 201.
Cleanup : tout participant TEST créé est supprimé en fin de module.

Run:
  pytest -o addopts='' /app/backend/tests/test_iter21_linked_duplicates.py -v \
      --junitxml=/app/test_reports/pytest/pytest_iter21.xml
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://church-connect-255.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin":   ("admin@udamg.app",        "AdminUdamg2026!"),
    "pasteur": ("pasteur@udamg.app",      "PasteurUdamg2026!"),
    "membre":  ("test.membre@udamg.app",  "MembreTest2026!"),
}

CREATED_PARTICIPANTS: list[str] = []
TEST_EMAIL_SELF = "test.membre@udamg.app"  # same as member email → triggers link
TEST_EMAIL_INVITE = "invite21.test@gmail.com"


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
        if "MJAC" in (e.get("titre") or "").upper():
            return e["id"]
    return evts[0]["id"]


@pytest.fixture(scope="module", autouse=True)
def _teardown(tokens):
    yield
    hA = H(tokens["admin"])
    # Ensure membre has no leftover registration either
    try:
        g = requests.get(f"{API}/event/participants/me",
                         params={"evenement_id": _last_event_id[0]} if _last_event_id else {},
                         headers=H(tokens["membre"]), timeout=10)
        if g.status_code == 200 and g.json():
            requests.delete(f"{API}/event/participants/me/{g.json()['id']}",
                            headers=H(tokens["membre"]), timeout=10)
    except Exception:
        pass
    for pid in list(set(CREATED_PARTICIPANTS)):
        try:
            requests.delete(f"{API}/event/participants/{pid}", headers=hA, timeout=15)
        except Exception:
            pass


_last_event_id: list[str] = []


# ========================================================================= #
# Pre-cleanup : ensure membre is NOT already registered
# ========================================================================= #
def test_00_precheck_cleanup(tokens, event_id):
    _last_event_id.append(event_id)
    g = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                     headers=H(tokens["membre"]), timeout=10)
    assert g.status_code == 200
    if g.json():
        d = requests.delete(f"{API}/event/participants/me/{g.json()['id']}",
                            headers=H(tokens["membre"]), timeout=10)
        assert d.status_code == 204, f"preclean failed: {d.status_code} {d.text}"
    # also wipe any orphan public inscription with this email
    hA = H(tokens["admin"])
    parts = requests.get(f"{API}/event/participants",
                        params={"evenement_id": event_id, "q": "TESTEUR"},
                        headers=hA, timeout=15).json()
    for p in parts:
        if (p.get("email") or "").lower() == TEST_EMAIL_SELF.lower():
            requests.delete(f"{API}/event/participants/{p['id']}", headers=hA, timeout=10)


# ========================================================================= #
# (A) Public inscription + /me link flow
# ========================================================================= #
class TestLinkOrphanPublicToAccount:
    def test_01_create_public_orphan(self, event_id):
        r = requests.post(f"{API}/event/participants/public", json={
            "evenement_id": event_id,
            "nom": "TESTEUR",
            "prenom": "Membre",
            "profil": "Externe",
            "email": TEST_EMAIL_SELF,
        }, timeout=30)
        assert r.status_code == 201, f"public create failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["badge_id"].startswith("EBED-")
        assert (d.get("email") or "").lower() == TEST_EMAIL_SELF.lower()
        CREATED_PARTICIPANTS.append(d["id"])
        pytest.orphan_badge = d["badge_id"]
        pytest.orphan_pid = d["id"]

    def test_02_register_me_links_existing_orphan(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/me", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "profil": "Membre",
        }, timeout=60)
        assert r.status_code == 201, f"expected 201 linked, got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("linked") is True, f"expected linked=True, got: {d}"
        assert d["badge_id"] == pytest.orphan_badge, (
            f"badge_id changed: expected {pytest.orphan_badge}, got {d['badge_id']}")
        assert d["id"] == pytest.orphan_pid, "participant id must be the same (rattachement)"
        assert d["profil"] == "Membre"

    def test_03_get_me_returns_linked_registration(self, tokens, event_id):
        r = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                         headers=H(tokens["membre"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d is not None and d["id"] == pytest.orphan_pid
        assert d["badge_id"] == pytest.orphan_badge

    def test_04_delete_me(self, tokens):
        r = requests.delete(f"{API}/event/participants/me/{pytest.orphan_pid}",
                            headers=H(tokens["membre"]), timeout=15)
        assert r.status_code == 204
        try:
            CREATED_PARTICIPANTS.remove(pytest.orphan_pid)
        except ValueError:
            pass

    def test_05_register_me_fresh_201_without_linked(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/me", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "profil": "Membre",
        }, timeout=60)
        assert r.status_code == 201, f"fresh /me got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("linked") in (None, False), f"linked should be absent/False on fresh insert, got: {d.get('linked')}"
        assert d["badge_id"].startswith("EBED-")
        pytest.fresh_pid = d["id"]
        CREATED_PARTICIPANTS.append(d["id"])

    def test_06_cleanup_fresh(self, tokens):
        r = requests.delete(f"{API}/event/participants/me/{pytest.fresh_pid}",
                            headers=H(tokens["membre"]), timeout=15)
        assert r.status_code == 204
        try:
            CREATED_PARTICIPANTS.remove(pytest.fresh_pid)
        except ValueError:
            pass


# ========================================================================= #
# (B) /other duplicate detection by nom+prenom (AGOSSA Kewen is a real participant)
# ========================================================================= #
class TestOtherDuplicate:
    def test_10_other_dup_name_prenom(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "nom": "AGOSSA",
            "prenom": "Kewen",
            "email": "autre21.x@gmail.com",
            "profil": "Externe",
        }, timeout=30)
        assert r.status_code == 409, f"expected 409 Doublon, got {r.status_code}: {r.text}"
        assert "Doublon" in r.text

    def test_11_other_valid(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id,
            "nom": "Nouveau21",
            "prenom": "Invite21",
            "email": TEST_EMAIL_INVITE,
            "profil": "Externe",
        }, timeout=60)
        assert r.status_code == 201, f"valid /other got {r.status_code}: {r.text}"
        d = r.json()
        assert d["badge_id"].startswith("EBED-")
        assert (d.get("email") or "").lower() == TEST_EMAIL_INVITE
        CREATED_PARTICIPANTS.append(d["id"])

    def test_12_cleanup_other(self, tokens):
        # cleanup handled by teardown fixture; also do it immediately
        if CREATED_PARTICIPANTS:
            pid = CREATED_PARTICIPANTS[-1]
            r = requests.delete(f"{API}/event/participants/{pid}", headers=H(tokens["admin"]), timeout=15)
            assert r.status_code == 204
            CREATED_PARTICIPANTS.remove(pid)
