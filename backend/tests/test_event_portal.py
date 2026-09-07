"""POLE 2 - Event Portal API tests (participants, sessions, pointages, enfants, exports)."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
# Fallback to frontend .env
if not BASE_URL:
    fe_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
    for line in fe_env.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

PASTEUR = ("admin@udamg.app", "AdminUdamg2026!")
OUVRIER = ("ouvrier@udamg.app", "OuvrierUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
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


@pytest.fixture(scope="module")
def event_id(pasteur_token):
    """Create a fresh event for this test module."""
    from datetime import datetime, timezone, timedelta
    payload = {
        "titre": "TEST_Event_Portal",
        "description": "test",
        "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "lieu": "Test Hall",
        "ville": "Angers",
        "type_evenement": "convention",
        "intervenants": ["Test"],
    }
    r = requests.post(f"{BASE_URL}/api/evenements", json=payload,
                      headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
    assert r.status_code == 201
    return r.json()["id"]


class TestParticipants:
    def test_create_participant_auto_badge_sequence(self, pasteur_token, event_id):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r1 = requests.post(f"{BASE_URL}/api/event/participants",
                           json={"evenement_id": event_id, "nom": "TEST_Alpha", "prenom": "Un", "profil": "Membre"},
                           headers=h, timeout=15)
        assert r1.status_code == 201, r1.text
        d1 = r1.json()
        assert d1["badge_id"] == "EBED-0001"
        assert d1["nom"] == "TEST_ALPHA"
        assert d1["profil"] == "Membre"

        r2 = requests.post(f"{BASE_URL}/api/event/participants",
                           json={"evenement_id": event_id, "nom": "TEST_Beta", "prenom": "Deux", "profil": "Inconnu"},
                           headers=h, timeout=15)
        assert r2.status_code == 201
        assert r2.json()["badge_id"] == "EBED-0002"

    def test_create_invalid_profil(self, pasteur_token, event_id):
        r = requests.post(f"{BASE_URL}/api/event/participants",
                          json={"evenement_id": event_id, "nom": "X", "prenom": "Y", "profil": "Bogus"},
                          headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
        assert r.status_code == 400

    def test_public_inscription_no_auth(self, event_id):
        r = requests.post(f"{BASE_URL}/api/event/participants/public",
                          json={"evenement_id": event_id, "nom": "TEST_Public", "prenom": "Anon",
                                "profil": "Prospect Évangélisé"}, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["badge_id"].startswith("EBED-")
        assert d["profil"] == "Prospect Évangélisé"

    def test_public_inscription_bad_event(self):
        r = requests.post(f"{BASE_URL}/api/event/participants/public",
                          json={"evenement_id": "nope", "nom": "X", "prenom": "Y", "profil": "Membre"},
                          timeout=15)
        assert r.status_code == 404

    def test_get_by_badge_no_auth(self, event_id):
        r = requests.get(f"{BASE_URL}/api/event/participants/by-badge/EBED-0001",
                         params={"evenement_id": event_id}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["badge_id"] == "EBED-0001"
        assert d["nom"] == "TEST_ALPHA"

    def test_get_by_badge_not_found(self, event_id):
        r = requests.get(f"{BASE_URL}/api/event/participants/by-badge/EBED-9999",
                         params={"evenement_id": event_id}, timeout=15)
        assert r.status_code == 404

    def test_list_participants(self, pasteur_token, event_id):
        r = requests.get(f"{BASE_URL}/api/event/participants",
                         params={"evenement_id": event_id},
                         headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 3
        # Filter by profil
        r2 = requests.get(f"{BASE_URL}/api/event/participants",
                          params={"evenement_id": event_id, "profil": "Inconnu"},
                          headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
        assert r2.status_code == 200
        assert all(p["profil"] == "Inconnu" for p in r2.json())


class TestSessions:
    def test_start_session_deactivates_previous(self, pasteur_token, event_id):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r1 = requests.post(f"{BASE_URL}/api/event/sessions/start",
                           json={"evenement_id": event_id, "nom": "TEST_Session1"}, headers=h, timeout=15)
        assert r1.status_code == 201
        s1 = r1.json()
        assert s1["active"] is True

        r2 = requests.post(f"{BASE_URL}/api/event/sessions/start",
                           json={"evenement_id": event_id, "nom": "TEST_Session2"}, headers=h, timeout=15)
        assert r2.status_code == 201
        s2 = r2.json()
        assert s2["active"] is True
        assert s2["id"] != s1["id"]

        # Verify only one active
        r3 = requests.get(f"{BASE_URL}/api/event/sessions/active",
                          params={"evenement_id": event_id}, headers=h, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["id"] == s2["id"]

    def test_evang_cannot_start_session(self, evang_token, event_id):
        r = requests.post(f"{BASE_URL}/api/event/sessions/start",
                          json={"evenement_id": event_id, "nom": "Nope"},
                          headers={"Authorization": f"Bearer {evang_token}"}, timeout=15)
        assert r.status_code == 403


class TestPointages:
    def test_pointage_first_scan_then_duplicate(self, pasteur_token, event_id):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r1 = requests.post(f"{BASE_URL}/api/event/pointages",
                           json={"evenement_id": event_id, "badge_id": "EBED-0001"}, headers=h, timeout=15)
        assert r1.status_code == 201, r1.text
        d1 = r1.json()
        assert d1["status"] == "ok"
        assert d1["participant"]["badge_id"] == "EBED-0001"

        r2 = requests.post(f"{BASE_URL}/api/event/pointages",
                           json={"evenement_id": event_id, "badge_id": "EBED-0001"}, headers=h, timeout=15)
        # duplicate returned as 201 with status=already
        assert r2.status_code == 201
        assert r2.json()["status"] == "already"

    def test_pointage_unknown_badge(self, pasteur_token, event_id):
        r = requests.post(f"{BASE_URL}/api/event/pointages",
                          json={"evenement_id": event_id, "badge_id": "EBED-9999"},
                          headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
        assert r.status_code == 404


class TestPointageLocked:
    def test_pointage_no_active_returns_423(self, pasteur_token):
        """Uses a fresh event (no session) to test 423."""
        from datetime import datetime, timezone, timedelta
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r = requests.post(f"{BASE_URL}/api/evenements",
                          json={"titre": "TEST_NoSession", "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                                "lieu": "X", "type_evenement": "convention"}, headers=h, timeout=15)
        assert r.status_code == 201
        eid = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/api/event/pointages",
                           json={"evenement_id": eid, "badge_id": "EBED-0001"}, headers=h, timeout=15)
        assert r2.status_code == 423

    def test_enfants_no_active_returns_423(self, pasteur_token):
        from datetime import datetime, timezone, timedelta
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r = requests.post(f"{BASE_URL}/api/evenements",
                          json={"titre": "TEST_NoSess2", "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                                "lieu": "X", "type_evenement": "convention"}, headers=h, timeout=15)
        eid = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/api/event/enfants",
                           json={"evenement_id": eid, "delta": 1}, headers=h, timeout=15)
        assert r2.status_code == 423


class TestEnfants:
    def test_enfants_accumulate(self, pasteur_token, event_id):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r1 = requests.post(f"{BASE_URL}/api/event/enfants",
                           json={"evenement_id": event_id, "delta": 3}, headers=h, timeout=15)
        assert r1.status_code == 200
        t1 = r1.json()["total"]
        r2 = requests.post(f"{BASE_URL}/api/event/enfants",
                           json={"evenement_id": event_id, "delta": 5}, headers=h, timeout=15)
        assert r2.json()["total"] == t1 + 5
        r3 = requests.post(f"{BASE_URL}/api/event/enfants",
                           json={"evenement_id": event_id, "delta": -1}, headers=h, timeout=15)
        assert r3.json()["total"] == t1 + 4


class TestDashboard:
    def test_dashboard_shape(self, pasteur_token, event_id):
        r = requests.get(f"{BASE_URL}/api/event/dashboard",
                         params={"evenement_id": event_id},
                         headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "by_profil", "by_eglise", "active_session",
                  "pointages_active_session", "enfants_active_session"):
            assert k in d, f"missing {k}"
        assert d["total"] >= 3
        assert d["pointages_active_session"] >= 1
        assert d["enfants_active_session"] >= 1
        assert d["active_session"] is not None


class TestExports:
    def test_csv_export(self, pasteur_token, event_id):
        r = requests.get(f"{BASE_URL}/api/event/exports/participants.csv",
                         params={"evenement_id": event_id},
                         headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=20)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        body = r.text
        assert body.split("\n")[0].startswith("badge_id,nom,prenom,profil")
        assert "EBED-0001" in body

    def test_bilan_pdf(self, pasteur_token, event_id):
        r = requests.get(f"{BASE_URL}/api/event/exports/bilan.pdf",
                         params={"evenement_id": event_id},
                         headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# =========================================================================== #
# ============ NEW ITERATION-5 TESTS: categorie_age + presence =============== #
# =========================================================================== #

@pytest.fixture(scope="module")
def event_id_v5(pasteur_token):
    """Fresh event dedicated to iteration-5 categorie_age + presence tests."""
    from datetime import datetime, timezone, timedelta
    r = requests.post(
        f"{BASE_URL}/api/evenements",
        json={
            "titre": "TEST_Event_V5_Age",
            "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lieu": "X", "type_evenement": "convention",
        },
        headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15,
    )
    assert r.status_code == 201
    return r.json()["id"]


class TestCategorieAge:
    def test_create_participant_with_categorie_age(self, pasteur_token, event_id_v5):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r = requests.post(
            f"{BASE_URL}/api/event/participants",
            json={"evenement_id": event_id_v5, "nom": "TEST_Ged", "prenom": "One",
                  "profil": "Membre", "categorie_age": "Gédéon (-18)"},
            headers=h, timeout=15,
        )
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["categorie_age"] == "Gédéon (-18)"
        # GET verifies persistence
        r2 = requests.get(f"{BASE_URL}/api/event/participants/{d['id']}",
                          headers=h, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["categorie_age"] == "Gédéon (-18)"

    def test_patch_participant_categorie_age(self, pasteur_token, event_id_v5):
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r = requests.post(
            f"{BASE_URL}/api/event/participants",
            json={"evenement_id": event_id_v5, "nom": "TEST_Patch", "prenom": "One",
                  "profil": "Membre"},
            headers=h, timeout=15,
        )
        pid = r.json()["id"]
        r2 = requests.patch(
            f"{BASE_URL}/api/event/participants/{pid}",
            json={"categorie_age": "CCMG (+30)"},
            headers=h, timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["categorie_age"] == "CCMG (+30)"
        # verify persistence via GET
        r3 = requests.get(f"{BASE_URL}/api/event/participants/{pid}",
                          headers=h, timeout=15)
        assert r3.json()["categorie_age"] == "CCMG (+30)"

    def test_public_inscription_with_categorie_age(self, event_id_v5):
        r = requests.post(
            f"{BASE_URL}/api/event/participants/public",
            json={"evenement_id": event_id_v5, "nom": "TEST_PubAge", "prenom": "Two",
                  "profil": "Prospect Évangélisé", "categorie_age": "J-30 (18-30)"},
            timeout=15,
        )
        assert r.status_code == 201, r.text
        assert r.json()["categorie_age"] == "J-30 (18-30)"


class TestPresenceDashboard:
    """Verify new dashboard 'presence' object and by_age aggregation."""

    def test_dashboard_shape_no_active_session(self, pasteur_token):
        """Fresh event with participants but NO active session → presence.* == 0."""
        from datetime import datetime, timezone, timedelta
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r = requests.post(
            f"{BASE_URL}/api/evenements",
            json={"titre": "TEST_V5_NoSess",
                  "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                  "lieu": "X", "type_evenement": "convention"},
            headers=h, timeout=15,
        )
        eid = r.json()["id"]
        # Add participant with categorie_age but NO session
        requests.post(f"{BASE_URL}/api/event/participants",
                      json={"evenement_id": eid, "nom": "TEST_Ged", "prenom": "X",
                            "profil": "Membre", "categorie_age": "Gédéon (-18)"},
                      headers=h, timeout=15)
        rd = requests.get(f"{BASE_URL}/api/event/dashboard",
                          params={"evenement_id": eid}, headers=h, timeout=15)
        assert rd.status_code == 200
        d = rd.json()
        assert "presence" in d
        assert "by_age" in d
        # No active session → all presence counters == 0
        p = d["presence"]
        for k in ("total", "membres", "vip", "prospects", "externes", "inconnus",
                  "gedeon", "j30", "ccmg", "enfants_pointes"):
            assert k in p, f"missing {k}"
            assert p[k] == 0, f"presence.{k} should be 0 with no active session, got {p[k]}"
        assert isinstance(p["by_eglise"], dict)
        # by_age should still count the Gédéon participant (aggregation over all parts)
        assert d["by_age"]["Gédéon (-18)"] >= 1

    def test_presence_reflects_active_session_only(self, pasteur_token):
        """
        Setup:
          - Event with 3 participants: 1 Gédéon Membre, 1 J-30 Prospect w/ VIP notes, 1 CCMG Externe
          - Start session
          - Scan ONLY Gédéon + VIP (not the CCMG)
          - Add 2 enfants (physical count)
        Expected presence:
          total=2, membres=1, prospects=1, externes=0, vip=1, gedeon=1, j30=1, ccmg=0
          enfants_pointes=0 (no participant flagged as Enfant scanned)
          enfants_active_session=2
        """
        from datetime import datetime, timezone, timedelta
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r = requests.post(
            f"{BASE_URL}/api/evenements",
            json={"titre": "TEST_V5_Presence",
                  "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                  "lieu": "X", "type_evenement": "convention"},
            headers=h, timeout=15,
        )
        eid = r.json()["id"]

        p1 = requests.post(f"{BASE_URL}/api/event/participants",
                           json={"evenement_id": eid, "nom": "TEST_Ged1", "prenom": "A",
                                 "profil": "Membre", "categorie_age": "Gédéon (-18)",
                                 "eglise": "UDAMG Angers"},
                           headers=h, timeout=15).json()
        p2 = requests.post(f"{BASE_URL}/api/event/participants",
                           json={"evenement_id": eid, "nom": "TEST_Vip", "prenom": "B",
                                 "profil": "Prospect Évangélisé",
                                 "categorie_age": "J-30 (18-30)",
                                 "notes": "Invité VIP conférencier",
                                 "eglise": "UDAMG Paris"},
                           headers=h, timeout=15).json()
        # CCMG not scanned - should NOT be counted in presence
        _p3 = requests.post(f"{BASE_URL}/api/event/participants",
                            json={"evenement_id": eid, "nom": "TEST_CCMG_notscan",
                                  "prenom": "C", "profil": "Externe",
                                  "categorie_age": "CCMG (+30)"},
                            headers=h, timeout=15).json()

        # Start session
        rs = requests.post(f"{BASE_URL}/api/event/sessions/start",
                           json={"evenement_id": eid, "nom": "TEST_V5_Sess"},
                           headers=h, timeout=15)
        assert rs.status_code == 201

        # Scan only p1 + p2
        for bid in (p1["badge_id"], p2["badge_id"]):
            rp = requests.post(f"{BASE_URL}/api/event/pointages",
                               json={"evenement_id": eid, "badge_id": bid},
                               headers=h, timeout=15)
            assert rp.status_code == 201, rp.text
            assert rp.json()["status"] == "ok"

        # Enfants +2
        requests.post(f"{BASE_URL}/api/event/enfants",
                      json={"evenement_id": eid, "delta": 2},
                      headers=h, timeout=15)

        rd = requests.get(f"{BASE_URL}/api/event/dashboard",
                          params={"evenement_id": eid}, headers=h, timeout=15)
        assert rd.status_code == 200
        d = rd.json()
        p = d["presence"]
        assert p["total"] == 2, p
        assert p["membres"] == 1
        assert p["prospects"] == 1
        assert p["externes"] == 0, "CCMG participant not scanned should NOT be counted"
        assert p["inconnus"] == 0
        assert p["vip"] == 1, "VIP in notes should be counted"
        assert p["gedeon"] == 1
        assert p["j30"] == 1
        assert p["ccmg"] == 0, "CCMG participant not scanned"
        assert p["enfants_pointes"] == 0
        # by_eglise only for scanned participants
        assert p["by_eglise"].get("UDAMG Angers") == 1
        assert p["by_eglise"].get("UDAMG Paris") == 1
        # enfants_active_session (physical count) is separate
        assert d["enfants_active_session"] == 2
        # by_age across ALL participants (including unscanned CCMG)
        assert d["by_age"]["Gédéon (-18)"] >= 1
        assert d["by_age"]["J-30 (18-30)"] >= 1
        assert d["by_age"]["CCMG (+30)"] >= 1


class TestPurge:
    def test_purge_missing_confirmation(self, pasteur_token, event_id):
        r = requests.post(f"{BASE_URL}/api/event/participants/purge",
                          json={"evenement_id": event_id, "confirmation": "nope"},
                          headers={"Authorization": f"Bearer {pasteur_token}"}, timeout=15)
        assert r.status_code == 400

    def test_purge_ouvrier_forbidden(self, ouvrier_token, event_id):
        r = requests.post(f"{BASE_URL}/api/event/participants/purge",
                          json={"evenement_id": event_id, "confirmation": "SUPPRIMER", "only_inconnus": True},
                          headers={"Authorization": f"Bearer {ouvrier_token}"}, timeout=15)
        assert r.status_code == 403

    def test_purge_only_inconnus(self, pasteur_token, event_id):
        # count inconnus before
        h = {"Authorization": f"Bearer {pasteur_token}"}
        r_before = requests.get(f"{BASE_URL}/api/event/participants",
                                params={"evenement_id": event_id, "profil": "Inconnu"},
                                headers=h, timeout=15)
        n_before = len(r_before.json())
        assert n_before >= 1
        r = requests.post(f"{BASE_URL}/api/event/participants/purge",
                          json={"evenement_id": event_id, "confirmation": "SUPPRIMER", "only_inconnus": True},
                          headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted"] == n_before
        r_after = requests.get(f"{BASE_URL}/api/event/participants",
                               params={"evenement_id": event_id, "profil": "Inconnu"},
                               headers=h, timeout=15)
        assert len(r_after.json()) == 0
