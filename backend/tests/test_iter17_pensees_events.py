"""Iter17 backend tests — Pensées CRUD + RBAC, Événements duree/horaires/rappel, émargement gating, admin/users gating."""
import os
import time
import requests
import pytest

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://church-connect-255.preview.emergentagent.com").rstrip("/") + "/api"

CREDS = {
    "admin":     ("admin@udamg.app",     "AdminUdamg2026!"),
    "technique": ("technique@udamg.app", "TechUdamg2026!"),
    "pasteur":   ("pasteur@udamg.app",   "PasteurUdamg2026!"),
    "membre":    ("membre@udamg.app",    "MembreUdamg2026!"),
}


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------- PENSEES ----------------------------
class TestPensees:
    created_ids = []

    def test_membre_can_list(self, tokens):
        r = requests.get(f"{BASE}/pensees", headers=_h(tokens["membre"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_can_create(self, tokens):
        # NOTE: sending "date" field yields 422 "none_required" — backend bug (name shadowing in PenseeIn).
        # Omitting date so the RBAC flow can be verified; date defaults to today() server-side.
        r = requests.post(f"{BASE}/pensees", headers=_h(tokens["admin"]),
                          json={"theme": "TEST_Pensée admin", "texte": "Verset test"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["theme"] == "TEST_Pensée admin"
        assert body["date"]  # server assigned today()
        TestPensees.created_ids.append(body["id"])

        # Verify persistence via GET
        r2 = requests.get(f"{BASE}/pensees", headers=_h(tokens["membre"]))
        assert r2.status_code == 200
        assert any(p["id"] == body["id"] for p in r2.json())

    def test_technique_can_create(self, tokens):
        r = requests.post(f"{BASE}/pensees", headers=_h(tokens["technique"]),
                          json={"theme": "TEST_Pensée tech"})
        assert r.status_code == 201, r.text
        TestPensees.created_ids.append(r.json()["id"])

    def test_date_field_accepts_iso_string(self, tokens):
        """Regression: previously blocked by name shadowing bug in PenseeIn (date field
        shadowed 'from datetime import date'). Now must accept ISO date string."""
        r = requests.post(f"{BASE}/pensees", headers=_h(tokens["admin"]),
                          json={"theme": "TEST_with_date", "date": "2026-01-15"})
        assert r.status_code == 201, r.text
        assert r.json()["date"] == "2026-01-15"
        TestPensees.created_ids.append(r.json()["id"])

    def test_pasteur_forbidden(self, tokens):
        r = requests.post(f"{BASE}/pensees", headers=_h(tokens["pasteur"]),
                          json={"theme": "TEST_should_fail", "date": "2026-01-17"})
        assert r.status_code == 403

    def test_membre_forbidden(self, tokens):
        r = requests.post(f"{BASE}/pensees", headers=_h(tokens["membre"]),
                          json={"theme": "TEST_should_fail", "date": "2026-01-18"})
        assert r.status_code == 403

    def test_membre_cannot_delete(self, tokens):
        if not TestPensees.created_ids:
            pytest.skip("no pensée created")
        r = requests.delete(f"{BASE}/pensees/{TestPensees.created_ids[0]}", headers=_h(tokens["membre"]))
        assert r.status_code == 403

    def test_technique_can_delete_cleanup(self, tokens):
        for pid in list(TestPensees.created_ids):
            r = requests.delete(f"{BASE}/pensees/{pid}", headers=_h(tokens["technique"]))
            assert r.status_code == 204, f"delete {pid} -> {r.status_code}"
            TestPensees.created_ids.remove(pid)


# ---------------------------- EVENTS ----------------------------
class TestEvents:
    event_id = None
    message_id = None

    def test_technique_create_with_duree_horaires(self, tokens):
        payload = {
            "titre": "TEST_iter17_event",
            "description": "Événement de test",
            "date": "2026-06-15T18:30:00Z",
            "lieu": "Salle Test",
            "ville": "CCMG Nantes",
            "type_evenement": "culte_special",
            "duree": "3 jours",
            "horaires": "Ven 19h · Sam 9h-18h",
        }
        r = requests.post(f"{BASE}/evenements", headers=_h(tokens["technique"]), json=payload)
        assert r.status_code == 201, r.text
        b = r.json()
        assert b["duree"] == "3 jours"
        assert b["horaires"] == "Ven 19h · Sam 9h-18h"
        assert b["titre"] == "TEST_iter17_event"
        TestEvents.event_id = b["id"]

    def test_patch_horaires(self, tokens):
        assert TestEvents.event_id
        r = requests.patch(f"{BASE}/evenements/{TestEvents.event_id}", headers=_h(tokens["technique"]),
                           json={"horaires": "Sam 10h · Dim 15h"})
        assert r.status_code == 200, r.text
        assert r.json()["horaires"] == "Sam 10h · Dim 15h"

        # verify persistence
        r2 = requests.get(f"{BASE}/evenements/{TestEvents.event_id}", headers=_h(tokens["membre"]))
        assert r2.status_code == 200
        assert r2.json()["horaires"] == "Sam 10h · Dim 15h"

    def test_rappel_pasteur_forbidden(self, tokens):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/evenements/{TestEvents.event_id}/rappel",
                          headers=_h(tokens["pasteur"]), json={})
        assert r.status_code == 403

    def test_rappel_admin_ok_creates_message(self, tokens):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/evenements/{TestEvents.event_id}/rappel",
                          headers=_h(tokens["admin"]), json={})
        assert r.status_code == 201, r.text
        b = r.json()
        assert "message_id" in b and "recipients" in b
        assert b["recipients"] >= 1
        TestEvents.message_id = b["message_id"]

        # Verify message appears in /messages
        r2 = requests.get(f"{BASE}/messages", headers=_h(tokens["membre"]))
        assert r2.status_code == 200
        titles = [m.get("title", "") for m in r2.json()]
        assert any("Rappel : TEST_iter17_event" in t for t in titles), f"titles: {titles[:5]}"

    def test_cleanup_rappel_message(self, tokens):
        if not TestEvents.message_id:
            pytest.skip()
        r = requests.delete(f"{BASE}/messages/{TestEvents.message_id}", headers=_h(tokens["admin"]))
        assert r.status_code in (200, 204), r.text


# ---------------------------- ÉMARGEMENT GATING ----------------------------
class TestEmargementGating:
    session_id = None

    def test_start_session_membre_forbidden(self, tokens):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/event/sessions/start", headers=_h(tokens["membre"]),
                          json={"evenement_id": TestEvents.event_id, "nom": "TEST_session"})
        assert r.status_code == 403

    def test_start_session_pasteur_ok(self, tokens):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/event/sessions/start", headers=_h(tokens["pasteur"]),
                          json={"evenement_id": TestEvents.event_id, "nom": "TEST_session"})
        assert r.status_code == 201, r.text
        TestEmargementGating.session_id = r.json()["id"]

    def test_pointage_membre_forbidden(self, tokens):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/event/pointages", headers=_h(tokens["membre"]),
                          json={"evenement_id": TestEvents.event_id, "badge_id": "EBED-0001"})
        assert r.status_code == 403

    def test_participants_add_membre_forbidden(self, tokens):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/event/participants", headers=_h(tokens["membre"]),
                          json={"evenement_id": TestEvents.event_id, "nom": "TEST", "prenom": "X", "profil": "Externe"})
        assert r.status_code == 403

    def test_public_inscription_no_auth_ok(self):
        assert TestEvents.event_id
        r = requests.post(f"{BASE}/event/participants/public",
                          json={"evenement_id": TestEvents.event_id, "nom": "TEST_public",
                                "prenom": "Anon", "profil": "Externe"})
        assert r.status_code == 201, r.text


# ---------------------------- ADMIN USERS GATING ----------------------------
class TestAdminUsersGating:
    def test_technique_forbidden(self, tokens):
        r = requests.get(f"{BASE}/admin/users", headers=_h(tokens["technique"]))
        assert r.status_code == 403

    def test_admin_ok(self, tokens):
        r = requests.get(f"{BASE}/admin/users", headers=_h(tokens["admin"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------------------- FINAL CLEANUP ----------------------------
class TestZCleanup:
    def test_delete_event(self, tokens):
        if not TestEvents.event_id:
            pytest.skip()
        r = requests.delete(f"{BASE}/evenements/{TestEvents.event_id}", headers=_h(tokens["admin"]))
        assert r.status_code in (200, 204), r.text
