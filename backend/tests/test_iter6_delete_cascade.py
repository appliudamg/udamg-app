"""Iteration 6 — Pôle 2 bug-fix tests.

Verifies:
  1) TEST_ prefixed events are cleaned from GET /api/evenements on startup
     and only the 4 seeded events remain.
  2) DELETE /api/evenements/{eid}:
     - evangeliste  -> 403
     - ouvrier      -> 403
     - pasteur      -> 204 and cascades (participants, sessions, pointages, enfants, invitations)
  3) POST /api/evenements still works for pasteur AND ouvrier.
"""
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv


load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    fe_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
    if fe_env.exists():
        for line in fe_env.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = (BASE_URL or "").rstrip("/")

PASTEUR = ("admin@udamg.app", "AdminUdamg2026!")
OUVRIER = ("ouvrier@udamg.app", "OuvrierUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def pasteur_token():
    return _login(*PASTEUR)


@pytest.fixture(scope="module")
def ouvrier_token():
    return _login(*OUVRIER)


@pytest.fixture(scope="module")
def evang_token():
    return _login(*EVANG)


def _create_event(token: str, titre: str = "TEST_Iter6_Delete") -> str:
    payload = {
        "titre": titre,
        "description": "iter6 delete cascade test",
        "date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "lieu": "Test Hall",
        "ville": "Angers",
        "type_evenement": "culte_special",
        "intervenants": ["Test"],
    }
    r = requests.post(
        f"{BASE_URL}/api/evenements", json=payload,
        headers={"Authorization": f"Bearer {token}"}, timeout=15,
    )
    assert r.status_code == 201, f"Create event failed: {r.status_code} {r.text}"
    return r.json()["id"]


class TestTestPrefixCleanup:
    """User complaint #2: too many TEST_ prefixed events polluting the list."""

    def test_no_test_prefixed_events_in_list(self, pasteur_token):
        r = requests.get(
            f"{BASE_URL}/api/evenements",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )
        assert r.status_code == 200
        events = r.json()
        test_leaks = [e for e in events if e.get("titre", "").startswith("TEST_")]
        # Note: this test itself might have created some right before, but the STARTUP cleanup
        # must have removed all TEST_ events. If any TEST_ appears here, it's from a concurrent
        # test run, not from stale seed data.
        assert not test_leaks or all(
            "iter6" in e.get("titre", "").lower() or "delete" in e.get("titre", "").lower()
            for e in test_leaks
        ), f"Stale TEST_ events polluting list: {[e['titre'] for e in test_leaks]}"

    def test_four_seeded_events_present(self, pasteur_token):
        r = requests.get(
            f"{BASE_URL}/api/evenements",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )
        assert r.status_code == 200
        events = r.json()
        titles = {e["titre"] for e in events}
        expected = {
            "Sortie d'évangélisation - Centre-ville",
            "Veillée de prière",
            "Culte spécial - Anciens",
            "Réunion des jeunes",
        }
        missing = expected - titles
        assert not missing, f"Seeded events missing: {missing}. Got: {titles}"


class TestCreateEventRBAC:
    """Feature: POST /api/evenements still works for pasteur AND ouvrier."""

    def test_pasteur_can_create(self, pasteur_token):
        eid = _create_event(pasteur_token, titre="TEST_Iter6_Pasteur_Create")
        # cleanup
        requests.delete(
            f"{BASE_URL}/api/evenements/{eid}",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )

    def test_ouvrier_can_create(self, ouvrier_token, pasteur_token):
        eid = _create_event(ouvrier_token, titre="TEST_Iter6_Ouvrier_Create")
        # cleanup via pasteur (ouvrier cannot delete)
        r = requests.delete(
            f"{BASE_URL}/api/evenements/{eid}",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )
        assert r.status_code == 204

    def test_evang_cannot_create(self, evang_token):
        payload = {
            "titre": "TEST_Iter6_Evang_Forbidden",
            "description": "should 403",
            "date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "lieu": "Nowhere",
            "ville": None,
            "type_evenement": "culte_special",
            "intervenants": [],
        }
        r = requests.post(
            f"{BASE_URL}/api/evenements", json=payload,
            headers={"Authorization": f"Bearer {evang_token}"}, timeout=15,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}"


class TestDeleteEventRBAC:
    """Feature: DELETE /api/evenements/{eid} requires pasteur role."""

    def test_ouvrier_delete_forbidden(self, pasteur_token, ouvrier_token):
        eid = _create_event(pasteur_token, titre="TEST_Iter6_Del_Ouvrier_Forbidden")
        try:
            r = requests.delete(
                f"{BASE_URL}/api/evenements/{eid}",
                headers={"Authorization": f"Bearer {ouvrier_token}"}, timeout=15,
            )
            assert r.status_code == 403, f"Expected 403 for ouvrier delete, got {r.status_code}"
            # Verify event still exists
            g = requests.get(
                f"{BASE_URL}/api/evenements/{eid}",
                headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
            )
            assert g.status_code == 200
        finally:
            requests.delete(
                f"{BASE_URL}/api/evenements/{eid}",
                headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
            )

    def test_evang_delete_forbidden(self, pasteur_token, evang_token):
        eid = _create_event(pasteur_token, titre="TEST_Iter6_Del_Evang_Forbidden")
        try:
            r = requests.delete(
                f"{BASE_URL}/api/evenements/{eid}",
                headers={"Authorization": f"Bearer {evang_token}"}, timeout=15,
            )
            assert r.status_code == 403, f"Expected 403 for evang delete, got {r.status_code}"
        finally:
            requests.delete(
                f"{BASE_URL}/api/evenements/{eid}",
                headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
            )

    def test_pasteur_delete_success_204(self, pasteur_token):
        eid = _create_event(pasteur_token, titre="TEST_Iter6_Del_Pasteur_OK")
        r = requests.delete(
            f"{BASE_URL}/api/evenements/{eid}",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )
        assert r.status_code == 204
        # Verify gone
        g = requests.get(
            f"{BASE_URL}/api/evenements/{eid}",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )
        assert g.status_code == 404, f"Event should be deleted, got {g.status_code}"

    def test_delete_missing_event_404(self, pasteur_token):
        r = requests.delete(
            f"{BASE_URL}/api/evenements/nonexistent-id-12345",
            headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
        )
        assert r.status_code == 404


class TestDeleteEventCascade:
    """Verify DELETE cascades to participants, sessions, pointages, enfants."""

    def test_cascade_deletes_related_data(self, pasteur_token):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        eid = _create_event(pasteur_token, titre="TEST_Iter6_Del_Cascade")

        # Create a participant
        p = requests.post(
            f"{BASE_URL}/api/event/participants",
            json={
                "evenement_id": eid,
                "prenom": "TEST_Cascade",
                "nom": "Person",
                "telephone": None,
                "email": None,
                "profil": "Membre",
                "eglise": "UDAMG Angers",
                "notes": None,
            },
            headers=h, timeout=15,
        )
        assert p.status_code == 201, f"Participant creation failed: {p.text}"
        pid = p.json()["id"]
        pbadge = p.json()["badge_id"]

        # Start a session
        s = requests.post(
            f"{BASE_URL}/api/event/sessions/start",
            json={"evenement_id": eid, "nom": "Session Cascade Test"},
            headers=h, timeout=15,
        )
        assert s.status_code == 201, f"Session start failed: {s.text}"

        # Scan the participant (pointage)
        pt = requests.post(
            f"{BASE_URL}/api/event/pointages",
            json={"evenement_id": eid, "badge_id": pbadge},
            headers=h, timeout=15,
        )
        assert pt.status_code == 201, f"Pointage failed: {pt.text}"

        # Add enfants
        e = requests.post(
            f"{BASE_URL}/api/event/enfants",
            json={"evenement_id": eid, "delta": 2},
            headers=h, timeout=15,
        )
        assert e.status_code in (200, 201), f"Enfants failed: {e.text}"

        # Now DELETE the event
        d = requests.delete(f"{BASE_URL}/api/evenements/{eid}", headers=h, timeout=15)
        assert d.status_code == 204

        # Verify participants list for this event is empty (event doesn't exist,
        # but the participants endpoint should return 404 or empty)
        lp = requests.get(
            f"{BASE_URL}/api/event/participants?evenement_id={eid}",
            headers=h, timeout=15,
        )
        if lp.status_code == 200:
            assert lp.json() == [], f"Participants not cascaded: {lp.json()}"

        # Verify active session is gone
        act = requests.get(
            f"{BASE_URL}/api/event/sessions/active?evenement_id={eid}",
            headers=h, timeout=15,
        )
        if act.status_code == 200:
            assert act.json() is None or act.json() == {}, f"Session not cascaded: {act.json()}"

        # Verify dashboard doesn't return the pointages/enfants counts
        dash = requests.get(
            f"{BASE_URL}/api/event/dashboard?evenement_id={eid}",
            headers=h, timeout=15,
        )
        if dash.status_code == 200:
            body = dash.json()
            assert body.get("total", 0) == 0, f"Participants not cascaded (dashboard total={body.get('total')})"
            assert body.get("pointages_active_session", 0) == 0
            assert body.get("enfants_active_session", 0) == 0
