"""Iteration 15 — UDAMG migration to Supabase.

Covers: auth (4 roles), password change, admin users CRUD, media taxonomy & RBAC,
media upload flow (Supabase Storage), favorites/progress/playlists, messaging (broadcast + read tracking),
events (create/participants/sessions/pointages/enfants/dashboard/exports/delete cascade).

Data cleanup: all TEST_ rows are removed at the end. Existing seed accounts and existing
media items / 'PG MJAC' event MUST NOT be deleted.
"""
import io
import os
import time

import pytest
import requests

BASE_URL = "http://localhost:8001/api"

ADMIN = ("admin@udamg.app", "AdminUdamg2026!")
TECH = ("technique@udamg.app", "TechUdamg2026!")
PASTEUR = ("pasteur@udamg.app", "PasteurUdamg2026!")
MEMBRE = ("membre@udamg.app", "MembreUdamg2026!")


# ------------------------------------------------------------------ #
# fixtures
# ------------------------------------------------------------------ #
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def tokens():
    return {
        "admin": _login(*ADMIN),
        "tech": _login(*TECH),
        "pasteur": _login(*PASTEUR),
        "membre": _login(*MEMBRE),
    }


# ------------------------------------------------------------------ #
# Auth
# ------------------------------------------------------------------ #
class TestAuth:
    def test_login_all_roles(self, tokens):
        assert all(tokens.values())

    def test_me_admin(self, tokens):
        r = requests.get(f"{BASE_URL}/auth/me", headers=_h(tokens["admin"]))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_membre(self, tokens):
        r = requests.get(f"{BASE_URL}/auth/me", headers=_h(tokens["membre"]))
        assert r.status_code == 200
        assert r.json()["role"] == "membre"

    def test_password_change_and_revert(self, tokens):
        # change membre password then revert
        new_pw = "MembreTemp2026!"
        r = requests.post(f"{BASE_URL}/auth/password",
                          headers=_h(tokens["membre"]),
                          json={"current_password": MEMBRE[1], "new_password": new_pw})
        assert r.status_code == 200, r.text
        # login with new pw
        r2 = requests.post(f"{BASE_URL}/auth/login", json={"email": MEMBRE[0], "password": new_pw})
        assert r2.status_code == 200
        new_tok = r2.json()["access_token"]
        # revert
        r3 = requests.post(f"{BASE_URL}/auth/password", headers=_h(new_tok),
                           json={"current_password": new_pw, "new_password": MEMBRE[1]})
        assert r3.status_code == 200
        # confirm original still works
        r4 = requests.post(f"{BASE_URL}/auth/login", json={"email": MEMBRE[0], "password": MEMBRE[1]})
        assert r4.status_code == 200


# ------------------------------------------------------------------ #
# Admin users
# ------------------------------------------------------------------ #
class TestAdminUsers:
    _uid = None

    def test_list_as_admin(self, tokens):
        r = requests.get(f"{BASE_URL}/admin/users", headers=_h(tokens["admin"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 4

    def test_list_forbidden_as_pasteur(self, tokens):
        r = requests.get(f"{BASE_URL}/admin/users", headers=_h(tokens["pasteur"]))
        assert r.status_code == 403

    def test_list_forbidden_as_tech(self, tokens):
        r = requests.get(f"{BASE_URL}/admin/users", headers=_h(tokens["tech"]))
        assert r.status_code == 403

    def test_create_patch_delete_flow(self, tokens):
        payload = {"email": f"TEST_iter15_{int(time.time())}@udamg.app",
                   "nom": "TEST_ITER15", "prenom": "User", "role": "leader",
                   "password": "TestUser2026!"}
        r = requests.post(f"{BASE_URL}/admin/users", headers=_h(tokens["admin"]), json=payload)
        assert r.status_code == 201, r.text
        u = r.json()
        uid = u["id"]
        assert u["role"] == "leader"

        # patch role → berger
        r2 = requests.patch(f"{BASE_URL}/admin/users/{uid}",
                            headers=_h(tokens["admin"]), json={"role": "berger"})
        assert r2.status_code == 200
        assert r2.json()["role"] == "berger"

        # disable
        r3 = requests.patch(f"{BASE_URL}/admin/users/{uid}",
                            headers=_h(tokens["admin"]), json={"disabled": True})
        assert r3.status_code == 200
        assert r3.json()["disabled"] is True

        # delete
        r4 = requests.delete(f"{BASE_URL}/admin/users/{uid}", headers=_h(tokens["admin"]))
        assert r4.status_code == 204

    def test_non_admin_create_403(self, tokens):
        payload = {"email": f"TEST_denied_{int(time.time())}@udamg.app",
                   "nom": "X", "prenom": "Y", "role": "membre"}
        r = requests.post(f"{BASE_URL}/admin/users", headers=_h(tokens["tech"]), json=payload)
        assert r.status_code == 403


# ------------------------------------------------------------------ #
# Media taxonomy & RBAC
# ------------------------------------------------------------------ #
class TestMediaTaxonomy:
    def test_categories_membre_no_restricted(self, tokens):
        r = requests.get(f"{BASE_URL}/media/categories", headers=_h(tokens["membre"]))
        assert r.status_code == 200
        cats = r.json()["categories"]
        all_subs = []
        for c in cats:
            all_subs.extend(c.get("subcategories") or [])
        assert "Réunion Pasteur" not in all_subs
        assert "Conseil élargi" not in all_subs
        assert r.json()["can_write"] is False

    def test_categories_pasteur_has_restricted(self, tokens):
        r = requests.get(f"{BASE_URL}/media/categories", headers=_h(tokens["pasteur"]))
        assert r.status_code == 200
        all_subs = []
        for c in r.json()["categories"]:
            all_subs.extend(c.get("subcategories") or [])
        assert "Réunion Pasteur" in all_subs
        assert "Conseil élargi" in all_subs

    def test_categories_tech_can_write(self, tokens):
        r = requests.get(f"{BASE_URL}/media/categories", headers=_h(tokens["tech"]))
        assert r.status_code == 200
        assert r.json()["can_write"] is True

    def test_admin_cannot_create_media(self, tokens):
        r = requests.post(f"{BASE_URL}/media/create-json", headers=_h(tokens["admin"]),
                          json={"title": "TEST_ITER15_denied", "author": "x",
                                "category": "culte_dimanche", "kind": "audio"})
        assert r.status_code == 403

    def test_create_reunion_conseil_elargi(self, tokens):
        r = requests.post(f"{BASE_URL}/media/create-json", headers=_h(tokens["tech"]),
                          json={"title": "TEST_ITER15_Restricted",
                                "author": "test", "category": "reunions",
                                "subcategory": "Conseil élargi", "kind": "audio"})
        assert r.status_code == 201, r.text
        pytest.restricted_media_id = r.json()["id"]

    def test_programmes_missing_subcategory_400(self, tokens):
        r = requests.post(f"{BASE_URL}/media/create-json", headers=_h(tokens["tech"]),
                          json={"title": "TEST_ITER15_bad", "author": "x",
                                "category": "programmes", "kind": "audio"})
        assert r.status_code == 400


# ------------------------------------------------------------------ #
# Media upload / RBAC read
# ------------------------------------------------------------------ #
class TestMediaUploadFlow:
    def test_upload_url_confirm_stream_delete(self, tokens):
        mid = getattr(pytest, "restricted_media_id", None)
        assert mid, "requires TestMediaTaxonomy.test_create_reunion_conseil_elargi to run first"

        # 1) get signed upload URL
        r = requests.post(f"{BASE_URL}/media/{mid}/upload-url",
                          headers=_h(tokens["tech"]),
                          json={"field": "audio", "filename": "t.mp3", "content_type": "audio/mpeg"})
        assert r.status_code == 200, r.text
        js = r.json()
        assert "upload_url" in js and "path" in js
        upload_url, path = js["upload_url"], js["path"]

        # 2) PUT a tiny binary to the signed url
        put = requests.put(upload_url, data=b"\x00" * 128,
                           headers={"Content-Type": "audio/mpeg"}, timeout=30)
        assert put.status_code in (200, 201), f"upload PUT {put.status_code}: {put.text[:200]}"

        # 3) confirm upload
        c = requests.post(f"{BASE_URL}/media/{mid}/confirm",
                          headers=_h(tokens["tech"]),
                          json={"field": "audio", "path": path, "duration": 1.0})
        assert c.status_code == 200, c.text
        assert c.json()["audio_path"] == path

        # 4) GET file as tech → 307 redirect to supabase signed URL
        f_tech = requests.get(f"{BASE_URL}/media/{mid}/file",
                              params={"token": tokens["tech"]}, allow_redirects=False, timeout=15)
        assert f_tech.status_code == 307
        assert "supabase" in f_tech.headers.get("Location", "").lower() or \
               "token=" in f_tech.headers.get("Location", "")

        # 5) GET file as membre → 403 (restricted)
        f_membre = requests.get(f"{BASE_URL}/media/{mid}/file",
                                params={"token": tokens["membre"]}, allow_redirects=False, timeout=15)
        assert f_membre.status_code == 403

        # 6) GET /media as membre should NOT include restricted
        lm = requests.get(f"{BASE_URL}/media", headers=_h(tokens["membre"]))
        assert lm.status_code == 200
        assert not any(m["id"] == mid for m in lm.json())

        # 7) GET single as membre → 403
        g_membre = requests.get(f"{BASE_URL}/media/{mid}", headers=_h(tokens["membre"]))
        assert g_membre.status_code == 403

        # 8) DELETE
        d = requests.delete(f"{BASE_URL}/media/{mid}", headers=_h(tokens["tech"]))
        assert d.status_code == 204
        pytest.restricted_media_id = None


# ------------------------------------------------------------------ #
# Favorites, progress, playlists
# ------------------------------------------------------------------ #
class TestFavPlaylists:
    _pid = None

    def test_favorite_and_progress(self, tokens):
        # find an existing media item that membre can read
        lm = requests.get(f"{BASE_URL}/media", headers=_h(tokens["membre"]))
        assert lm.status_code == 200
        items = lm.json()
        if not items:
            pytest.skip("no media items visible to membre")
        mid = items[0]["id"]

        r = requests.post(f"{BASE_URL}/media/{mid}/favorite", headers=_h(tokens["membre"]))
        assert r.status_code == 201

        fl = requests.get(f"{BASE_URL}/media/favorites/list", headers=_h(tokens["membre"]))
        assert fl.status_code == 200 and any(x["id"] == mid for x in fl.json())

        # progress
        pr = requests.post(f"{BASE_URL}/media/progress", headers=_h(tokens["membre"]),
                           json={"media_id": mid, "position_seconds": 10.5, "completed": False})
        assert pr.status_code == 200 and pr.json()["last_position_seconds"] == 10.5

        cont = requests.get(f"{BASE_URL}/media/progress/continue", headers=_h(tokens["membre"]))
        assert cont.status_code == 200
        assert any(x["id"] == mid for x in cont.json())

        rm = requests.delete(f"{BASE_URL}/media/{mid}/favorite", headers=_h(tokens["membre"]))
        assert rm.status_code == 204

    def test_playlist_flow(self, tokens):
        # create playlist
        r = requests.post(f"{BASE_URL}/playlists", headers=_h(tokens["membre"]),
                          json={"title": "TEST_ITER15_playlist"})
        assert r.status_code == 201
        pid = r.json()["id"]
        TestFavPlaylists._pid = pid

        # find media
        lm = requests.get(f"{BASE_URL}/media", headers=_h(tokens["membre"]))
        items = lm.json()
        if items:
            mid = items[0]["id"]
            add = requests.post(f"{BASE_URL}/playlists/{pid}/items/{mid}", headers=_h(tokens["membre"]))
            assert add.status_code == 200
            assert mid in add.json()["item_ids"]

        # delete
        d = requests.delete(f"{BASE_URL}/playlists/{pid}", headers=_h(tokens["membre"]))
        assert d.status_code == 204


# ------------------------------------------------------------------ #
# Messaging
# ------------------------------------------------------------------ #
class TestMessaging:
    _mid = None

    def test_send_as_admin(self, tokens):
        r = requests.post(f"{BASE_URL}/messages", headers=_h(tokens["admin"]),
                          json={"title": "TEST_ITER15 broadcast", "body": "hello all"})
        assert r.status_code == 201, r.text
        js = r.json()
        assert js["title"] == "TEST_ITER15 broadcast"
        assert js["recipients_count"] >= 4  # at least the 4 seeded accounts
        TestMessaging._mid = js["id"]

    def test_send_as_membre_403(self, tokens):
        r = requests.post(f"{BASE_URL}/messages", headers=_h(tokens["membre"]),
                          json={"title": "TEST_denied", "body": "x"})
        assert r.status_code == 403

    def test_list_and_mark_read(self, tokens):
        mid = TestMessaging._mid
        assert mid
        # membre sees msg as unread
        lm = requests.get(f"{BASE_URL}/messages", headers=_h(tokens["membre"]))
        assert lm.status_code == 200
        entry = next((m for m in lm.json() if m["id"] == mid), None)
        assert entry is not None
        assert entry["read"] is False

        # unread-count
        uc = requests.get(f"{BASE_URL}/messages/unread-count", headers=_h(tokens["membre"]))
        assert uc.status_code == 200 and uc.json()["unread"] >= 1

        # mark read
        mr = requests.post(f"{BASE_URL}/messages/{mid}/read", headers=_h(tokens["membre"]))
        assert mr.status_code == 200 and mr.json()["read"] is True

        # /reads as admin
        reads = requests.get(f"{BASE_URL}/messages/{mid}/reads", headers=_h(tokens["admin"]))
        assert reads.status_code == 200
        rjs = reads.json()
        assert any(u["email"] == MEMBRE[0] for u in rjs["read"])
        assert rjs["read_count"] >= 1

    def test_delete_message(self, tokens):
        mid = TestMessaging._mid
        r = requests.delete(f"{BASE_URL}/messages/{mid}", headers=_h(tokens["admin"]))
        assert r.status_code == 204


# ------------------------------------------------------------------ #
# Events
# ------------------------------------------------------------------ #
class TestEvents:
    _eid = None
    _badge = None

    def test_create_event_as_pasteur(self, tokens):
        payload = {"titre": "TEST_ITER15 Event", "description": "test",
                   "date": "2026-06-01T10:00:00Z", "lieu": "Rennes",
                   "ville": "CCMG Rennes", "type_evenement": "convention",
                   "intervenants": ["Pastor A"]}
        r = requests.post(f"{BASE_URL}/evenements", headers=_h(tokens["pasteur"]), json=payload)
        assert r.status_code == 201, r.text
        TestEvents._eid = r.json()["id"]

    def test_membre_create_forbidden(self, tokens):
        r = requests.post(f"{BASE_URL}/evenements", headers=_h(tokens["membre"]),
                          json={"titre": "TEST_denied", "date": "2026-06-01T10:00:00Z",
                                "lieu": "x", "type_evenement": "x"})
        assert r.status_code == 403

    def test_public_inscription(self, tokens):
        eid = TestEvents._eid
        r = requests.post(f"{BASE_URL}/event/participants/public",
                          json={"evenement_id": eid, "nom": "TESTNOM",
                                "prenom": "Testeur", "profil": "Membre",
                                "categorie_age": "CCMG (+30)"})
        assert r.status_code == 201
        p = r.json()
        assert p["badge_id"].startswith("EBED-")
        TestEvents._badge = p["badge_id"]

    def test_list_participants(self, tokens):
        r = requests.get(f"{BASE_URL}/event/participants",
                         params={"evenement_id": TestEvents._eid},
                         headers=_h(tokens["pasteur"]))
        assert r.status_code == 200
        assert any(p["badge_id"] == TestEvents._badge for p in r.json())

    def test_session_and_pointages(self, tokens):
        eid = TestEvents._eid
        r = requests.post(f"{BASE_URL}/event/sessions/start", headers=_h(tokens["pasteur"]),
                          json={"evenement_id": eid, "nom": "Session TEST_ITER15"})
        assert r.status_code == 201

        # first pointage → ok
        r1 = requests.post(f"{BASE_URL}/event/pointages", headers=_h(tokens["pasteur"]),
                           json={"evenement_id": eid, "badge_id": TestEvents._badge})
        assert r1.status_code in (200, 201)
        assert r1.json()["status"] == "ok"
        # second pointage → already
        r2 = requests.post(f"{BASE_URL}/event/pointages", headers=_h(tokens["pasteur"]),
                           json={"evenement_id": eid, "badge_id": TestEvents._badge})
        assert r2.status_code in (200, 201)
        assert r2.json()["status"] == "already"

    def test_enfants_and_dashboard(self, tokens):
        eid = TestEvents._eid
        e = requests.post(f"{BASE_URL}/event/enfants", headers=_h(tokens["pasteur"]),
                          json={"evenement_id": eid, "delta": 2})
        assert e.status_code == 200
        assert e.json()["total"] == 2

        d = requests.get(f"{BASE_URL}/event/dashboard", params={"evenement_id": eid},
                         headers=_h(tokens["pasteur"]))
        assert d.status_code == 200
        assert d.json()["total"] >= 1

        p = requests.get(f"{BASE_URL}/event/pointages", params={"evenement_id": eid},
                         headers=_h(tokens["pasteur"]))
        assert p.status_code == 200

    def test_exports(self, tokens):
        eid = TestEvents._eid
        csv = requests.get(f"{BASE_URL}/event/exports/participants.csv",
                           params={"evenement_id": eid}, headers=_h(tokens["pasteur"]))
        assert csv.status_code == 200
        assert "badge_id" in csv.text.split("\n")[0]

        pdf = requests.get(f"{BASE_URL}/event/exports/bilan.pdf",
                           params={"evenement_id": eid}, headers=_h(tokens["pasteur"]))
        assert pdf.status_code == 200
        assert pdf.content[:4] == b"%PDF"

    def test_delete_event_cascade(self, tokens):
        eid = TestEvents._eid
        r = requests.delete(f"{BASE_URL}/evenements/{eid}", headers=_h(tokens["pasteur"]))
        assert r.status_code == 204
