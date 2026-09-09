"""Pôle 3 — Médias & Enseignements — backend regression tests."""
import io
import os
import struct

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://church-connect-255.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PASTEUR = ("admin@udamg.app", "AdminUdamg2026!")
OUVRIER = ("ouvrier@udamg.app", "OuvrierUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "pasteur": _login(*PASTEUR),
        "ouvrier": _login(*OUVRIER),
        "evang": _login(*EVANG),
    }


# ---------------- Seed & categories ---------------- #
class TestSeed:
    def test_seed_returns_8_items(self, tokens):
        r = requests.get(f"{API}/media", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        # There may be leftover uploads; ensure at least the 8 seeded ones are present
        assert len(items) >= 8, f"Expected >=8, got {len(items)}"
        titles = {i["title"] for i in items}
        expected_titles = {
            "La grâce qui transforme", "Diriger avec humilité", "Prière du matin",
            "Podcast — Foi & Vie #12", "Adoration — Louez l'Éternel",
            "Méditation sur le Psaume 23", "Convention EBED 2025 — Session 1",
            "Livre audio — Vivre par la foi",
        }
        assert expected_titles.issubset(titles), f"Missing seeded titles: {expected_titles - titles}"

    def test_seed_categories_present(self, tokens):
        r = requests.get(f"{API}/media", headers=_hdr(tokens["pasteur"]), timeout=15)
        cats = {i["category"] for i in r.json()}
        expected = {"Enseignements du Dimanche", "Leadership", "Prières & Worship",
                    "Podcasts", "Foi & Méditation", "Livres Audio"}
        assert expected.issubset(cats)

    def test_seed_items_have_null_audio(self, tokens):
        r = requests.get(f"{API}/media", headers=_hdr(tokens["pasteur"]), timeout=15)
        items = r.json()
        seeded_titles = {"La grâce qui transforme", "Diriger avec humilité"}
        for it in items:
            if it["title"] in seeded_titles:
                assert it["audio_path"] is None

    def test_categories_endpoint(self, tokens):
        r = requests.get(f"{API}/media/categories", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data["categories"]) == 6
        assert data["kinds"] == ["audio", "video", "podcast", "livre"]


# ---------------- Filter ---------------- #
class TestFilter:
    def test_filter_by_kind_podcast(self, tokens):
        r = requests.get(f"{API}/media?kind=podcast", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for i in items:
            assert i["kind"] == "podcast"

    def test_filter_by_category(self, tokens):
        r = requests.get(f"{API}/media?category=Leadership", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for i in items:
            assert i["category"] == "Leadership"

    def test_filter_by_search_query(self, tokens):
        r = requests.get(f"{API}/media?q=grâce", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any("grâce" in i["title"].lower() for i in items)


# ---------------- Upload / RBAC / Stream ---------------- #
def _tiny_wav_bytes():
    """Return a minimal valid WAV file (44 bytes header + 100 bytes silence)."""
    sample_rate = 8000
    num_samples = 100
    data = b"\x00" * num_samples
    header = b"RIFF" + struct.pack("<I", 36 + num_samples) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate, 1, 8)
    header += b"data" + struct.pack("<I", num_samples)
    return header + data


def _tiny_png_bytes():
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
        b"\x00\x00\x00\x03\x00\x01\xa8\x89\xd6\xef\x00\x00\x00\x00IEND\xaeB`\x82"
    )


class TestUploadFlow:
    created_id = None

    def test_upload_rbac_evangeliste_forbidden(self, tokens):
        files = {"audio": ("t.wav", _tiny_wav_bytes(), "audio/wav")}
        data = {"title": "TEST_Refused", "author": "T", "category": "Leadership", "kind": "audio"}
        r = requests.post(f"{API}/media", headers=_hdr(tokens["evang"]),
                          data=data, files=files, timeout=60)
        assert r.status_code == 403, f"Expected 403 got {r.status_code}"

    def test_upload_as_pasteur_ok(self, tokens):
        files = {
            "audio": ("test.wav", _tiny_wav_bytes(), "audio/wav"),
            "cover": ("cover.png", _tiny_png_bytes(), "image/png"),
        }
        data = {
            "title": "TEST_Pole3_Upload", "author": "TEST_Author",
            "category": "Leadership", "kind": "audio",
            "description": "Test upload description",
        }
        r = requests.post(f"{API}/media", headers=_hdr(tokens["pasteur"]),
                          data=data, files=files, timeout=60)
        assert r.status_code == 201, f"{r.status_code}: {r.text}"
        body = r.json()
        assert body["title"] == "TEST_Pole3_Upload"
        assert body["audio_path"] is not None
        assert body["audio_path"].startswith(f"udamg/media/{body['id']}/audio.")
        assert body["cover_path"] is not None
        TestUploadFlow.created_id = body["id"]

    def test_stream_with_bearer(self, tokens):
        assert TestUploadFlow.created_id
        r = requests.get(f"{API}/media/{TestUploadFlow.created_id}/file",
                         headers=_hdr(tokens["pasteur"]), timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 40
        assert r.content[:4] == b"RIFF"

    def test_stream_with_query_token(self, tokens):
        assert TestUploadFlow.created_id
        r = requests.get(f"{API}/media/{TestUploadFlow.created_id}/file",
                         params={"token": tokens["pasteur"]}, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"RIFF"

    def test_cover_endpoint(self, tokens):
        assert TestUploadFlow.created_id
        r = requests.get(f"{API}/media/{TestUploadFlow.created_id}/cover", timeout=30)
        assert r.status_code == 200
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_delete_rbac_evangeliste(self, tokens):
        assert TestUploadFlow.created_id
        r = requests.delete(f"{API}/media/{TestUploadFlow.created_id}",
                            headers=_hdr(tokens["evang"]), timeout=15)
        assert r.status_code == 403

    def test_delete_as_pasteur(self, tokens):
        assert TestUploadFlow.created_id
        r = requests.delete(f"{API}/media/{TestUploadFlow.created_id}",
                            headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 204
        # Verify it's gone
        r2 = requests.get(f"{API}/media/{TestUploadFlow.created_id}",
                          headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r2.status_code == 404


# ---------------- Favorites ---------------- #
class TestFavorites:
    def test_favorite_flow(self, tokens):
        r = requests.get(f"{API}/media", headers=_hdr(tokens["pasteur"]), timeout=15)
        mid = r.json()[0]["id"]

        # Add
        r = requests.post(f"{API}/media/{mid}/favorite",
                          headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 201

        # List
        r = requests.get(f"{API}/media/favorites/list",
                         headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        favs = r.json()
        assert any(i["id"] == mid for i in favs)

        # Delete
        r = requests.delete(f"{API}/media/{mid}/favorite",
                            headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 204

        # Verify empty (for this media)
        r = requests.get(f"{API}/media/favorites/list",
                         headers=_hdr(tokens["pasteur"]), timeout=15)
        assert not any(i["id"] == mid for i in r.json())


# ---------------- Playlists ---------------- #
class TestPlaylists:
    def test_full_playlist_flow(self, tokens):
        media = requests.get(f"{API}/media", headers=_hdr(tokens["pasteur"]), timeout=15).json()
        mid = media[0]["id"]

        # Create
        r = requests.post(f"{API}/playlists",
                          headers=_hdr(tokens["pasteur"]),
                          json={"title": "TEST_Pole3_Playlist"}, timeout=15)
        assert r.status_code == 201
        pid = r.json()["id"]
        assert r.json()["title"] == "TEST_Pole3_Playlist"

        # Add item
        r = requests.post(f"{API}/playlists/{pid}/items/{mid}",
                          headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        assert mid in r.json()["item_ids"]

        # Get playlist
        r = requests.get(f"{API}/playlists/{pid}",
                         headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["item_ids"] == [mid]

        # Remove item
        r = requests.delete(f"{API}/playlists/{pid}/items/{mid}",
                            headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        assert mid not in r.json()["item_ids"]

        # Delete playlist
        r = requests.delete(f"{API}/playlists/{pid}",
                            headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 204


# ---------------- Progress ---------------- #
class TestProgress:
    def test_progress_and_continue(self, tokens):
        media = requests.get(f"{API}/media", headers=_hdr(tokens["pasteur"]), timeout=15).json()
        mid = media[0]["id"]

        r = requests.post(f"{API}/media/progress",
                          headers=_hdr(tokens["pasteur"]),
                          json={"media_id": mid, "last_position_seconds": 45, "completed": False},
                          timeout=15)
        assert r.status_code == 200
        assert r.json()["last_position_seconds"] == 45.0
        assert r.json()["completed"] is False

        r = requests.get(f"{API}/media/progress/continue",
                         headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        assert any(i["id"] == mid for i in r.json())


# ---------------- Regression Pôle 1/2 smoke ---------------- #
class TestRegression:
    def test_villes_still_has_15_ccmg(self, tokens):
        r = requests.get(f"{API}/villes", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        villes = r.json()
        ccmg_names = [v["nom"] for v in villes if v["nom"].startswith("CCMG ")]
        assert len(ccmg_names) >= 15, f"Expected >=15 CCMG villes, got {len(ccmg_names)}"

    def test_evenements_list(self, tokens):
        r = requests.get(f"{API}/evenements", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 1
