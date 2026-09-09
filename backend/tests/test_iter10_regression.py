"""Iteration 10 regression: verify 3 fixes from iteration 9.
1) POST/PATCH /api/contacts persists custom referent.
2) POST /api/contacts without referent falls back to `${prenom} ${nom}`.
3) POST/DELETE /api/villes work for pasteur, forbidden for evangeliste.
"""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ["EXPO_PUBLIC_BACKEND_URL"]
).rstrip("/")

PASTEUR = ("admin@udamg.app", "AdminUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    return body["access_token"], body["user"]


@pytest.fixture(scope="module")
def pasteur_ctx():
    tok, user = _login(*PASTEUR)
    # pick any existing ville for contact tests
    r = requests.get(f"{BASE_URL}/api/villes", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 200
    villes = r.json()
    assert villes, "no villes seeded"
    return {"token": tok, "user": user, "ville_id": villes[0]["id"], "ville_nom": villes[0]["nom"]}


@pytest.fixture(scope="module")
def evang_ctx():
    tok, user = _login(*EVANG)
    return {"token": tok, "user": user}


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Referent persistence (custom value) ----------
class TestReferent:
    created_ids = []

    def test_post_contact_with_custom_referent(self, pasteur_ctx):
        payload = {
            "nom": "TEST_Ref10", "prenom": "Alpha", "tel": "0102030405",
            "categorie": "CCMG", "niveau": 1,
            "referent": "Frère Timothée",
            "context_type": "ville", "context_id": pasteur_ctx["ville_id"],
        }
        r = requests.post(f"{BASE_URL}/api/contacts", json=payload, headers=_auth(pasteur_ctx["token"]), timeout=10)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["referent"] == "Frère Timothée", f"referent overwritten: {body['referent']}"
        TestReferent.created_ids.append(body["id"])

        # verify via GET
        g = requests.get(
            f"{BASE_URL}/api/contacts",
            params={"context_type": "ville", "context_id": pasteur_ctx["ville_id"]},
            headers=_auth(pasteur_ctx["token"]), timeout=10,
        )
        assert g.status_code == 200
        match = [c for c in g.json() if c["id"] == body["id"]]
        assert match and match[0]["referent"] == "Frère Timothée"

    def test_patch_contact_referent_persists(self, pasteur_ctx):
        assert TestReferent.created_ids, "prerequisite contact missing"
        cid = TestReferent.created_ids[0]
        r = requests.patch(
            f"{BASE_URL}/api/contacts/{cid}",
            json={"referent": "Sœur Marie"},
            headers=_auth(pasteur_ctx["token"]), timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["referent"] == "Sœur Marie"

        # confirm via GET
        g = requests.get(
            f"{BASE_URL}/api/contacts",
            params={"context_type": "ville", "context_id": pasteur_ctx["ville_id"]},
            headers=_auth(pasteur_ctx["token"]), timeout=10,
        )
        match = [c for c in g.json() if c["id"] == cid]
        assert match and match[0]["referent"] == "Sœur Marie"

    def test_post_contact_without_referent_defaults_to_user_name(self, pasteur_ctx):
        payload = {
            "nom": "TEST_RefDefault10", "prenom": "Beta",
            "categorie": "CCMG", "niveau": 1,
            "context_type": "ville", "context_id": pasteur_ctx["ville_id"],
        }
        r = requests.post(f"{BASE_URL}/api/contacts", json=payload, headers=_auth(pasteur_ctx["token"]), timeout=10)
        assert r.status_code == 201, r.text
        body = r.json()
        expected = f"{pasteur_ctx['user']['prenom']} {pasteur_ctx['user']['nom']}".strip()
        assert body["referent"] == expected, f"expected default '{expected}' got '{body['referent']}'"
        TestReferent.created_ids.append(body["id"])

    def test_post_contact_empty_string_referent_defaults(self, pasteur_ctx):
        payload = {
            "nom": "TEST_RefEmpty10", "prenom": "Gamma",
            "categorie": "CCMG", "niveau": 1,
            "referent": "",
            "context_type": "ville", "context_id": pasteur_ctx["ville_id"],
        }
        r = requests.post(f"{BASE_URL}/api/contacts", json=payload, headers=_auth(pasteur_ctx["token"]), timeout=10)
        assert r.status_code == 201, r.text
        expected = f"{pasteur_ctx['user']['prenom']} {pasteur_ctx['user']['nom']}".strip()
        assert r.json()["referent"] == expected
        TestReferent.created_ids.append(r.json()["id"])

    @classmethod
    def teardown_class(cls):
        tok, _ = _login(*PASTEUR)
        for cid in cls.created_ids:
            requests.delete(f"{BASE_URL}/api/contacts/{cid}", headers=_auth(tok), timeout=10)


# ---------- Villes create/delete + RBAC ----------
class TestVillesCRUD:
    created_id = None

    def test_pasteur_creates_ville(self, pasteur_ctx):
        r = requests.post(
            f"{BASE_URL}/api/villes",
            json={"nom": "CCMG Lyon Test", "code_postal": "69000"},
            headers=_auth(pasteur_ctx["token"]), timeout=10,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["nom"] == "CCMG Lyon Test"
        TestVillesCRUD.created_id = body["id"]

        # GET verifies persistence
        g = requests.get(f"{BASE_URL}/api/villes", headers=_auth(pasteur_ctx["token"]), timeout=10)
        assert g.status_code == 200
        assert any(v["id"] == body["id"] for v in g.json()), "created ville not in GET list"

    def test_evangeliste_cannot_create_ville(self, evang_ctx):
        r = requests.post(
            f"{BASE_URL}/api/villes",
            json={"nom": "TEST_Forbidden", "code_postal": ""},
            headers=_auth(evang_ctx["token"]), timeout=10,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_evangeliste_cannot_delete_ville(self, evang_ctx):
        assert TestVillesCRUD.created_id
        r = requests.delete(
            f"{BASE_URL}/api/villes/{TestVillesCRUD.created_id}",
            headers=_auth(evang_ctx["token"]), timeout=10,
        )
        assert r.status_code == 403

    def test_pasteur_deletes_ville(self, pasteur_ctx):
        assert TestVillesCRUD.created_id
        r = requests.delete(
            f"{BASE_URL}/api/villes/{TestVillesCRUD.created_id}",
            headers=_auth(pasteur_ctx["token"]), timeout=10,
        )
        assert r.status_code == 204, r.text

        g = requests.get(f"{BASE_URL}/api/villes", headers=_auth(pasteur_ctx["token"]), timeout=10)
        assert not any(v["id"] == TestVillesCRUD.created_id for v in g.json()), "ville still present after delete"
        TestVillesCRUD.created_id = None

    @classmethod
    def teardown_class(cls):
        if cls.created_id:
            tok, _ = _login(*PASTEUR)
            requests.delete(f"{BASE_URL}/api/villes/{cls.created_id}", headers=_auth(tok), timeout=10)
