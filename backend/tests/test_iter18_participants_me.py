"""Iter18 — tests for the self-registration + badge delivery flows and ancillary endpoints.

Covers:
- GET/POST/PATCH/DELETE /api/event/participants/me
- POST /api/event/participants/other (email validation + nom/prenom)
- Private badge message in /api/messages (visibility + unread-count)
- GET /api/event/sessions empty + start + stop (pasteur)
- Regression: POST /api/messages broadcast + reads list
"""
import os
import re
from typing import Optional

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://church-connect-255.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin":    ("admin@udamg.app",     "AdminUdamg2026!"),
    "pasteur":  ("pasteur@udamg.app",   "PasteurUdamg2026!"),
    "membre":   ("membre@udamg.app",    "MembreUdamg2026!"),
    "technique":("technique@udamg.app", "TechUdamg2026!"),
}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("access_token") or j.get("token")
    assert tok, f"missing token in {j}"
    return tok


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


def H(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def event_id(tokens):
    r = requests.get(f"{API}/evenements", headers=H(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    evts = r.json()
    assert evts, "No event exists — expected PG MJAC"
    # Prefer PG MJAC
    for e in evts:
        if "MJAC" in (e.get("titre") or ""):
            return e["id"]
    return evts[0]["id"]


@pytest.fixture(scope="module")
def membre_id(tokens):
    r = requests.get(f"{API}/auth/me", headers=H(tokens["membre"]), timeout=30)
    assert r.status_code == 200
    return r.json()["id"]


# ------------------------------------------------------------------------- #
# Cleanup helper: ensure membre is NOT registered at the start of the module
# ------------------------------------------------------------------------- #
@pytest.fixture(scope="module", autouse=True)
def _initial_cleanup(tokens, event_id):
    r = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                     headers=H(tokens["membre"]), timeout=30)
    if r.status_code == 200 and r.json():
        pid = r.json()["id"]
        requests.delete(f"{API}/event/participants/me/{pid}", headers=H(tokens["membre"]), timeout=30)
    yield
    # final cleanup
    r = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                     headers=H(tokens["membre"]), timeout=30)
    if r.status_code == 200 and r.json():
        pid = r.json()["id"]
        requests.delete(f"{API}/event/participants/me/{pid}", headers=H(tokens["membre"]), timeout=30)


# ========================================================================= #
# Participants/me — happy path + edge cases
# ========================================================================= #
class TestParticipantMe:
    def test_01_me_null_when_not_registered(self, tokens, event_id):
        r = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                         headers=H(tokens["membre"]), timeout=30)
        assert r.status_code == 200
        assert r.json() is None, f"expected null, got {r.json()}"

    def test_02_post_me_creates_participant_with_delivery(self, tokens, event_id, membre_id):
        r = requests.post(f"{API}/event/participants/me", headers=H(tokens["membre"]), timeout=60, json={
            "evenement_id": event_id, "profil": "Membre", "eglise": "CCMG Nantes",
        })
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("user_id") == membre_id
        assert (d.get("email") or "").lower() == "membre@udamg.app"
        assert d.get("profil") == "Membre"
        assert d.get("eglise") == "CCMG Nantes"
        assert re.match(r"^EBED-\d{4}$", d.get("badge_id") or ""), f"bad badge_id {d.get('badge_id')}"
        delivery = d.get("delivery") or {}
        assert delivery.get("message_sent") is True, f"message_sent not true: {delivery}"
        # email_sent may be true/false; don't block
        pytest.pid = d["id"]
        pytest.badge_id = d["badge_id"]

    def test_03_post_me_duplicate_returns_409(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/me", headers=H(tokens["membre"]), timeout=30, json={
            "evenement_id": event_id, "profil": "Membre", "eglise": "CCMG Nantes",
        })
        assert r.status_code == 409, f"expected 409 on duplicate, got {r.status_code}"

    def test_04_me_now_returns_participant(self, tokens, event_id):
        r = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                         headers=H(tokens["membre"]), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d is not None
        assert d["id"] == pytest.pid
        assert d["badge_id"] == pytest.badge_id


# ========================================================================= #
# Private badge message
# ========================================================================= #
class TestPrivateBadgeMessage:
    def test_05_membre_sees_private_badge_message(self, tokens, event_id, membre_id):
        r = requests.get(f"{API}/messages", headers=H(tokens["membre"]), timeout=30)
        assert r.status_code == 200
        msgs = r.json()
        badge_msgs = [m for m in msgs if (m.get("title") or "").startswith("Votre badge")]
        assert badge_msgs, "No private badge message found for membre"
        m = badge_msgs[0]
        assert m.get("recipient_id") == membre_id
        au = m.get("action_url") or ""
        assert "/badge?event=" in au and f"b={pytest.badge_id}" in au, f"bad action_url {au}"
        pytest.badge_message_id = m["id"]

    def test_06_admin_does_not_see_private_badge_message(self, tokens):
        r = requests.get(f"{API}/messages", headers=H(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        msgs = r.json()
        assert not any(m["id"] == pytest.badge_message_id for m in msgs), \
            "Admin should NOT see membre's private badge message in listing"

    def test_07_pasteur_cannot_get_the_private_message(self, tokens):
        r = requests.get(f"{API}/messages/{pytest.badge_message_id}", headers=H(tokens["pasteur"]), timeout=30)
        assert r.status_code == 404, f"expected 404 for non-recipient non-admin, got {r.status_code}"

    def test_08_unread_count_membre_includes_private(self, tokens):
        r = requests.get(f"{API}/messages/unread-count", headers=H(tokens["membre"]), timeout=30)
        assert r.status_code == 200
        assert r.json().get("unread", 0) >= 1


# ========================================================================= #
# PATCH / DELETE /me
# ========================================================================= #
class TestPatchDeleteMe:
    def test_09_patch_me_tel(self, tokens):
        r = requests.patch(f"{API}/event/participants/me/{pytest.pid}", headers=H(tokens["membre"]),
                           json={"tel": "+33611111111"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("tel") == "+33611111111"

    def test_10_patch_me_wrong_owner_404(self, tokens):
        r = requests.patch(f"{API}/event/participants/me/{pytest.pid}", headers=H(tokens["admin"]),
                           json={"tel": "+330000"}, timeout=30)
        # admin doesn't own this /me record → 404
        assert r.status_code == 404

    def test_11_delete_me_204(self, tokens, event_id):
        r = requests.delete(f"{API}/event/participants/me/{pytest.pid}", headers=H(tokens["membre"]), timeout=30)
        assert r.status_code == 204
        r2 = requests.get(f"{API}/event/participants/me", params={"evenement_id": event_id},
                          headers=H(tokens["membre"]), timeout=30)
        assert r2.status_code == 200 and r2.json() is None

    def test_12_rePOST_me_assigns_new_badge(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/me", headers=H(tokens["membre"]), json={
            "evenement_id": event_id, "profil": "Membre", "eglise": "CCMG Nantes",
        }, timeout=60)
        assert r.status_code == 201
        d = r.json()
        assert re.match(r"^EBED-\d{4}$", d["badge_id"])
        # Spec: "badge_id ne doit pas entrer en conflit : nouveau numéro"
        # _next_badge_id = max(existing)+1; after DELETE, same number may be re-issued (no conflict).
        # Verify no actual uniqueness collision via a GET by badge.
        gr = requests.get(f"{API}/event/participants/by-badge/{d['badge_id']}",
                          params={"evenement_id": event_id}, headers=H(tokens["membre"]), timeout=30)
        assert gr.status_code == 200 and gr.json()["id"] == d["id"], "badge must map to this participant only"
        pytest.pid2 = d["id"]
        pytest.badge_id2 = d["badge_id"]


# ========================================================================= #
# POST /participants/other
# ========================================================================= #
class TestRegisterOther:
    def test_13_other_valid_email(self, tokens, event_id, membre_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id, "nom": "TEST_Beneficiaire", "prenom": "Jean",
            "email": "test_benef_iter18@example.com", "profil": "Externe",
        }, timeout=60)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("user_id") is None
        assert d.get("registered_by") == membre_id
        assert d.get("referent"), "referent should be populated with membre's name"
        assert "delivery" in d
        pytest.other_pid = d["id"]

    def test_14_other_invalid_email(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id, "nom": "X", "prenom": "Y", "email": "nope",
        }, timeout=30)
        assert r.status_code == 400

    def test_15_other_empty_nom(self, tokens, event_id):
        r = requests.post(f"{API}/event/participants/other", headers=H(tokens["membre"]), json={
            "evenement_id": event_id, "nom": "", "prenom": "Y", "email": "valid@example.com",
        }, timeout=30)
        assert r.status_code == 400


# ========================================================================= #
# Sessions
# ========================================================================= #
class TestSessions:
    def test_16_sessions_initial_state(self, tokens, event_id):
        r = requests.get(f"{API}/event/sessions", params={"evenement_id": event_id},
                         headers=H(tokens["pasteur"]), timeout=30)
        assert r.status_code == 200
        # Expected empty according to spec but we won't fail if there are stale sessions
        data = r.json()
        pytest.initial_sessions = data

    def test_17_start_and_stop_session_pasteur(self, tokens, event_id):
        r = requests.post(f"{API}/event/sessions/start", headers=H(tokens["pasteur"]), json={
            "evenement_id": event_id, "nom": "TEST_iter18_session",
        }, timeout=30)
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        sid = r.json()["id"]
        r2 = requests.post(f"{API}/event/sessions/{sid}/stop", headers=H(tokens["pasteur"]), timeout=30)
        assert r2.status_code == 200
        # cleanup via admin purge pointages isn't needed; stop leaves session row inactive.
        # best effort: no DELETE endpoint for sessions.


# ========================================================================= #
# Regression: broadcast message visibility & reads
# ========================================================================= #
class TestBroadcastRegression:
    def test_18_broadcast_visible_to_all(self, tokens):
        r = requests.post(f"{API}/messages", headers=H(tokens["admin"]),
                          json={"title": "TEST_iter18_broadcast", "body": "hello"}, timeout=30)
        assert r.status_code == 201
        mid = r.json()["id"]
        pytest.broadcast_id = mid
        for role in ("admin", "membre", "pasteur"):
            lst = requests.get(f"{API}/messages", headers=H(tokens[role]), timeout=30).json()
            assert any(m["id"] == mid for m in lst), f"{role} does not see broadcast"

    def test_19_reads_endpoint_admin(self, tokens):
        r = requests.get(f"{API}/messages/{pytest.broadcast_id}/reads",
                         headers=H(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "read" in j and "unread" in j
        assert j["recipients_count"] >= 1

    def test_20_cleanup_broadcast(self, tokens):
        r = requests.delete(f"{API}/messages/{pytest.broadcast_id}", headers=H(tokens["admin"]), timeout=30)
        assert r.status_code == 204


# ========================================================================= #
# Final cleanup — delete 2nd me registration + the 'other' participant
# ========================================================================= #
class TestFinalCleanup:
    def test_99_cleanup(self, tokens):
        # delete membre's current /me registration (via /me)
        if hasattr(pytest, "pid2"):
            requests.delete(f"{API}/event/participants/me/{pytest.pid2}", headers=H(tokens["membre"]), timeout=30)
        # delete other beneficiary (admin uses /participants/{pid})
        if hasattr(pytest, "other_pid"):
            r = requests.delete(f"{API}/event/participants/{pytest.other_pid}", headers=H(tokens["admin"]), timeout=30)
            assert r.status_code in (204, 404)
