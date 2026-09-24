"""Backend tests for UDAMG iteration 14 — multi-role RBAC, admin/users CRUD, ville restrictions."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ADMIN = ("admin@udamg.app", "AdminUdamg2026!")
OUVRIER = ("ouvrier@udamg.app", "OuvrierUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")
MEMBRE = ("membre@udamg.app", "MembreUdamg2026!")


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


def _h(tok): return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(*ADMIN),
        "ouvrier": _login(*OUVRIER),
        "evang": _login(*EVANG),
        "membre": _login(*MEMBRE),
    }


@pytest.fixture(scope="module")
def angers_id(tokens):
    tok, _ = tokens["admin"]
    r = requests.get(f"{BASE_URL}/api/villes", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    for v in r.json():
        if v["nom"] == "CCMG Angers":
            return v["id"]
    pytest.fail("Angers ville not seeded")


@pytest.fixture(scope="module")
def paris_id(tokens):
    tok, _ = tokens["admin"]
    r = requests.get(f"{BASE_URL}/api/villes", headers=_h(tok), timeout=15)
    for v in r.json():
        if v["nom"] == "CCMG Paris":
            return v["id"]
    pytest.fail("Paris ville not seeded")


# --- SEED verification ---
class TestSeed:
    def test_seed_has_4_roles(self, tokens):
        tok, _ = tokens["admin"]
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        users = {u["email"]: u for u in r.json()}
        for e, role, ville in [
            ("admin@udamg.app", "pasteur", None),
            ("ouvrier@udamg.app", "ouvrier", "CCMG Angers"),
            ("evangeliste@udamg.app", "evangeliste", "CCMG Angers"),
            ("membre@udamg.app", "membre", "CCMG Angers"),
        ]:
            assert e in users, f"{e} missing"
            assert users[e]["role"] == role
            assert users[e]["ville_nom"] == ville
            assert users[e]["is_approved"] is True


# --- Auth ---
class TestAuth:
    def test_register_disabled(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": "TEST_x@udamg.app", "password": "abcdef123",
                                "nom": "T", "prenom": "T"}, timeout=15)
        assert r.status_code == 403
        d = r.json().get("detail") or {}
        assert isinstance(d, dict) and d.get("code") == "registration_disabled"

    def test_login_all_roles(self, tokens):
        for k in ["admin", "ouvrier", "evang", "membre"]:
            tok, u = tokens[k]
            assert tok
            assert u["role"] in {"pasteur", "ouvrier", "evangeliste", "membre"}

    def test_me_has_ville_fields(self, tokens):
        tok, _ = tokens["ouvrier"]
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["ville_nom"] == "CCMG Angers"
        assert d["ville_id"]
        assert d["is_approved"] is True


# --- RBAC on /admin/users ---
class TestAdminRBAC:
    def test_non_pasteur_forbidden(self, tokens):
        for k in ["ouvrier", "evang", "membre"]:
            tok, _ = tokens[k]
            r = requests.get(f"{BASE_URL}/api/admin/users", headers=_h(tok), timeout=15)
            assert r.status_code == 403, f"{k} should not access admin/users"


# --- Admin CRUD ---
class TestAdminCRUD:
    created_ids = []

    def test_create_ouvrier_without_ville_400(self, tokens):
        tok, _ = tokens["admin"]
        r = requests.post(f"{BASE_URL}/api/admin/users", headers=_h(tok),
                          json={"email": "TEST_no_ville@udamg.app", "prenom": "X", "nom": "Y",
                                "role": "ouvrier"}, timeout=15)
        assert r.status_code == 400

    def test_create_bad_ville_404(self, tokens):
        tok, _ = tokens["admin"]
        r = requests.post(f"{BASE_URL}/api/admin/users", headers=_h(tok),
                          json={"email": "TEST_badv@udamg.app", "prenom": "X", "nom": "Y",
                                "role": "ouvrier", "ville_id": "does-not-exist"}, timeout=15)
        assert r.status_code == 404

    def test_create_ouvrier_ok_and_login(self, tokens, angers_id):
        tok, _ = tokens["admin"]
        r = requests.post(f"{BASE_URL}/api/admin/users", headers=_h(tok),
                          json={"email": "TEST_ouvrier1@udamg.app", "prenom": "Test",
                                "nom": "Ci", "role": "ouvrier", "ville_id": angers_id,
                                "password": "TestPwd123"}, timeout=15)
        assert r.status_code == 201, r.text
        u = r.json()
        TestAdminCRUD.created_ids.append(u["id"])
        assert u["role"] == "ouvrier"
        assert u["ville_id"] == angers_id
        assert u["ville_nom"] == "CCMG Angers"
        assert u["is_approved"] is True
        # login works
        lr = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "TEST_ouvrier1@udamg.app", "password": "TestPwd123"}, timeout=15)
        assert lr.status_code == 200

    def test_create_pasteur_ignores_ville(self, tokens, angers_id):
        tok, _ = tokens["admin"]
        r = requests.post(f"{BASE_URL}/api/admin/users", headers=_h(tok),
                          json={"email": "TEST_pasteur1@udamg.app", "prenom": "P",
                                "nom": "P", "role": "pasteur", "ville_id": angers_id,
                                "password": "TestPwd123"}, timeout=15)
        assert r.status_code == 201
        u = r.json()
        TestAdminCRUD.created_ids.append(u["id"])
        assert u["ville_id"] is None
        assert u["ville_nom"] is None

    def test_create_duplicate_409(self, tokens, angers_id):
        tok, _ = tokens["admin"]
        r = requests.post(f"{BASE_URL}/api/admin/users", headers=_h(tok),
                          json={"email": "TEST_ouvrier1@udamg.app", "prenom": "X", "nom": "Y",
                                "role": "ouvrier", "ville_id": angers_id}, timeout=15)
        assert r.status_code == 409

    def test_create_without_password_unusable(self, tokens, angers_id):
        tok, _ = tokens["admin"]
        r = requests.post(f"{BASE_URL}/api/admin/users", headers=_h(tok),
                          json={"email": "TEST_googleonly@udamg.app", "prenom": "G",
                                "nom": "O", "role": "membre"}, timeout=15)
        assert r.status_code == 201
        TestAdminCRUD.created_ids.append(r.json()["id"])
        # try login → 401 (unusable pwd)
        lr = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "TEST_googleonly@udamg.app", "password": "anything123"}, timeout=15)
        assert lr.status_code == 401

    def test_patch_role_and_ville(self, tokens):
        tok, _ = tokens["admin"]
        uid = TestAdminCRUD.created_ids[0]
        r = requests.patch(f"{BASE_URL}/api/admin/users/{uid}", headers=_h(tok),
                           json={"role": "membre", "ville_id": None}, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "membre"

    def test_pasteur_self_protection(self, tokens):
        tok, u = tokens["admin"]
        r = requests.patch(f"{BASE_URL}/api/admin/users/{u['id']}", headers=_h(tok),
                           json={"role": "membre"}, timeout=15)
        assert r.status_code == 400
        r2 = requests.patch(f"{BASE_URL}/api/admin/users/{u['id']}", headers=_h(tok),
                           json={"disabled": True}, timeout=15)
        assert r2.status_code == 400
        r3 = requests.delete(f"{BASE_URL}/api/admin/users/{u['id']}", headers=_h(tok), timeout=15)
        assert r3.status_code == 400

    def test_delete_users_cleanup(self, tokens):
        tok, _ = tokens["admin"]
        for uid in TestAdminCRUD.created_ids:
            r = requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=_h(tok), timeout=15)
            assert r.status_code in (204, 404)


# --- Ville restrictions on Pôle 1 ---
class TestVilleRestriction:
    def test_ouvrier_other_ville_403(self, tokens, paris_id):
        tok, _ = tokens["ouvrier"]
        r = requests.get(f"{BASE_URL}/api/contacts?context_type=ville&context_id={paris_id}",
                        headers=_h(tok), timeout=15)
        assert r.status_code == 403

    def test_ouvrier_own_ville_ok(self, tokens, angers_id):
        tok, _ = tokens["ouvrier"]
        r = requests.get(f"{BASE_URL}/api/contacts?context_type=ville&context_id={angers_id}",
                        headers=_h(tok), timeout=15)
        assert r.status_code == 200

    def test_ouvrier_global_403(self, tokens):
        tok, _ = tokens["ouvrier"]
        r = requests.get(f"{BASE_URL}/api/contacts?context_type=GLOBAL&context_id=x",
                        headers=_h(tok), timeout=15)
        assert r.status_code == 403

    def test_create_contact_other_ville_403(self, tokens, paris_id):
        tok, _ = tokens["ouvrier"]
        r = requests.post(f"{BASE_URL}/api/contacts", headers=_h(tok),
                          json={"nom": "TEST_z", "prenom": "z", "categorie": "CCMG",
                                "context_type": "ville", "context_id": paris_id}, timeout=15)
        assert r.status_code == 403


# --- Membre restriction ---
class TestMembreRestriction:
    def test_membre_forbidden_pole1(self, tokens, angers_id):
        tok, _ = tokens["membre"]
        endpoints = [
            f"/api/contacts?context_type=ville&context_id={angers_id}",
            f"/api/contacts/stats?context_type=ville&context_id={angers_id}",
        ]
        for ep in endpoints:
            r = requests.get(f"{BASE_URL}{ep}", headers=_h(tok), timeout=15)
            # contacts & create should be blocked
            if "/contacts?" in ep:
                assert r.status_code == 403, f"{ep} should be forbidden for membre"

    def test_membre_can_media(self, tokens):
        tok, _ = tokens["membre"]
        r = requests.get(f"{BASE_URL}/api/media", headers=_h(tok), timeout=15)
        assert r.status_code == 200

    def test_membre_cannot_create_contact(self, tokens, angers_id):
        tok, _ = tokens["membre"]
        r = requests.post(f"{BASE_URL}/api/contacts", headers=_h(tok),
                          json={"nom": "TEST_x", "prenom": "x", "categorie": "CCMG",
                                "context_type": "ville", "context_id": angers_id}, timeout=15)
        assert r.status_code == 403


# --- Ouvrier own-contacts scope ---
class TestOwnContactsScope:
    def test_ouvrier_sees_only_own(self, tokens, angers_id):
        tok_o, u_o = tokens["ouvrier"]
        tok_a, _ = tokens["admin"]
        # create 1 by ouvrier + 1 by pasteur
        c1 = requests.post(f"{BASE_URL}/api/contacts", headers=_h(tok_o),
                          json={"nom": "TEST_OWN1", "prenom": "O", "categorie": "CCMG",
                                "context_type": "ville", "context_id": angers_id}, timeout=15).json()
        c2 = requests.post(f"{BASE_URL}/api/contacts", headers=_h(tok_a),
                          json={"nom": "TEST_OWN2", "prenom": "P", "categorie": "CCMG",
                                "context_type": "ville", "context_id": angers_id}, timeout=15).json()
        r = requests.get(f"{BASE_URL}/api/contacts?context_type=ville&context_id={angers_id}",
                        headers=_h(tok_o), timeout=15)
        assert r.status_code == 200
        names = {c["nom"] for c in r.json()}
        assert "TEST_OWN1" in names
        assert "TEST_OWN2" not in names
        # cleanup
        for cid in [c1.get("id"), c2.get("id")]:
            if cid: requests.delete(f"{BASE_URL}/api/contacts/{cid}", headers=_h(tok_a), timeout=15)


# --- Google session gate ---
class TestGoogleGate:
    def test_session_invalid_id(self):
        r = requests.post(f"{BASE_URL}/api/auth/session",
                          json={"session_id": "definitely-invalid-xyz"}, timeout=15)
        assert r.status_code == 401
