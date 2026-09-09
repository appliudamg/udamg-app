"""Iteration 12 — HTTP Range requests validation for iOS AVPlayer / expo-audio streaming.

Focus: GET /api/media/{id}/file must honor HTTP Range requests (RFC 7233) so that
iOS AVPlayer / expo-audio can stream properly. Also validates regression on
iter 11 endpoints and cross-pole smoke.
"""
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


# ---------- Fixture: create media with an 8044-byte silent WAV file ----------

def _silent_wav(duration_sec: float = 1.0, sample_rate: int = 8000) -> bytes:
    """Return a WAV file: 44-byte header + 8000 bytes of silence => 8044 bytes total for 1s @ 8kHz mono 8-bit."""
    num_samples = int(sample_rate * duration_sec)
    data = b"\x00" * num_samples  # silent 8-bit unsigned samples
    header = b"RIFF" + struct.pack("<I", 36 + num_samples) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate, 1, 8)
    header += b"data" + struct.pack("<I", num_samples)
    return header + data


def _tiny_png() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
        b"\x00\x00\x00\x03\x00\x01\xa8\x89\xd6\xef\x00\x00\x00\x00IEND\xaeB`\x82"
    )


@pytest.fixture(scope="module")
def media_ctx(tokens):
    """Create a media entry via create-json + upload, yield ({id, total_bytes}), then delete."""
    wav = _silent_wav(1.0, 8000)
    assert len(wav) == 8044, f"Fixture WAV size expected 8044, got {len(wav)}"

    # create-json (iter 11 native path)
    r = requests.post(
        f"{API}/media/create-json",
        headers={**_hdr(tokens["pasteur"]), "Content-Type": "application/json"},
        json={
            "title": "TEST_ITER12_Range",
            "author": "TEST_Author",
            "category": "Leadership",
            "kind": "audio",
            "description": "Range fixture",
        },
        timeout=15,
    )
    assert r.status_code == 201, f"create-json failed {r.status_code}: {r.text}"
    mid = r.json()["id"]

    # upload audio (iter 11 single-file path)
    r = requests.post(
        f"{API}/media/{mid}/upload",
        headers=_hdr(tokens["pasteur"]),
        data={"kind": "audio"},
        files={"file": ("silent.wav", wav, "audio/wav")},
        timeout=60,
    )
    assert r.status_code == 200, f"upload audio failed {r.status_code}: {r.text}"
    assert r.json()["audio_path"] is not None

    # upload cover
    r = requests.post(
        f"{API}/media/{mid}/upload",
        headers=_hdr(tokens["pasteur"]),
        data={"kind": "cover"},
        files={"file": ("cover.png", _tiny_png(), "image/png")},
        timeout=60,
    )
    assert r.status_code == 200

    yield {"id": mid, "total": len(wav)}

    # cleanup
    r = requests.delete(f"{API}/media/{mid}", headers=_hdr(tokens["pasteur"]), timeout=15)
    assert r.status_code in (204, 404)


# ---------------- RANGE 206 tests ---------------- #
class TestRangeRequests:
    def test_range_first_two_bytes(self, tokens, media_ctx):
        """Range: bytes=0-1 => 206, Content-Range 'bytes 0-1/{total}', Content-Length 2."""
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=0-1"},
            timeout=30,
        )
        assert r.status_code == 206, f"Expected 206, got {r.status_code}"
        assert r.headers.get("Content-Range") == f"bytes 0-1/{media_ctx['total']}"
        assert r.headers.get("Content-Length") == "2"
        assert r.headers.get("Accept-Ranges") == "bytes"
        assert len(r.content) == 2
        # RIFF starts with "RI"
        assert r.content == b"RI"

    def test_range_middle_slice(self, tokens, media_ctx):
        """Range: bytes=100-500 => 206, Content-Length 401."""
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=100-500"},
            timeout=30,
        )
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 100-500/{media_ctx['total']}"
        assert r.headers.get("Content-Length") == "401"
        assert len(r.content) == 401

    def test_range_out_of_bounds_416(self, tokens, media_ctx):
        """Range: bytes=99999- => 416 Requested Range Not Satisfiable."""
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=99999-"},
            timeout=30,
        )
        assert r.status_code == 416, f"Expected 416, got {r.status_code}"
        assert r.headers.get("Content-Range") == f"bytes */{media_ctx['total']}"

    def test_range_open_ended(self, tokens, media_ctx):
        """Range: bytes=0- => 206 with the entire file."""
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=0-"},
            timeout=30,
        )
        assert r.status_code == 206
        total = media_ctx["total"]
        assert r.headers.get("Content-Range") == f"bytes 0-{total - 1}/{total}"
        assert r.headers.get("Content-Length") == str(total)
        assert len(r.content) == total
        assert r.content[:4] == b"RIFF"

    def test_range_1kb_e2e_slice(self, tokens, media_ctx):
        """Range: bytes=0-1023 => 206 with exactly 1024 bytes."""
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=0-1023"},
            timeout=30,
        )
        assert r.status_code == 206
        assert r.headers.get("Content-Length") == "1024"
        assert r.headers.get("Content-Range") == f"bytes 0-1023/{media_ctx['total']}"
        assert len(r.content) == 1024
        assert r.content[:4] == b"RIFF"


# ---------------- STREAM 200 (no Range) ---------------- #
class TestFullStream:
    def test_stream_without_range_returns_200(self, tokens, media_ctx):
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers=_hdr(tokens["pasteur"]),
            timeout=30,
        )
        assert r.status_code == 200
        assert r.headers.get("Accept-Ranges") == "bytes"
        assert r.headers.get("Content-Length") == str(media_ctx["total"])
        assert len(r.content) == media_ctx["total"]
        assert r.content[:4] == b"RIFF"


# ---------------- AUTH on range ---------------- #
class TestAuthOnRange:
    def test_range_without_token_returns_401(self, media_ctx):
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={"Range": "bytes=0-1"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_range_with_query_token_returns_206(self, tokens, media_ctx):
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            params={"token": tokens["pasteur"]},
            headers={"Range": "bytes=0-1"},
            timeout=30,
        )
        assert r.status_code == 206
        assert r.headers.get("Content-Length") == "2"

    def test_range_with_bearer_header_returns_206(self, tokens, media_ctx):
        r = requests.get(
            f"{API}/media/{media_ctx['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=0-1"},
            timeout=30,
        )
        assert r.status_code == 206


# ---------------- Cover endpoint (unchanged) ---------------- #
class TestCoverEndpoint:
    def test_cover_returns_200_image(self, media_ctx):
        r = requests.get(f"{API}/media/{media_ctx['id']}/cover", timeout=30)
        assert r.status_code == 200
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


# ---------------- Iter 11 regression: create-json + upload RBAC ---------------- #
class TestIter11Regression:
    def test_create_json_pasteur_201(self, tokens):
        r = requests.post(
            f"{API}/media/create-json",
            headers={**_hdr(tokens["pasteur"]), "Content-Type": "application/json"},
            json={
                "title": "TEST_ITER12_iter11_reg",
                "author": "T",
                "category": "Leadership",
                "kind": "audio",
            },
            timeout=15,
        )
        assert r.status_code == 201
        mid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/media/{mid}", headers=_hdr(tokens["pasteur"]), timeout=15)

    def test_create_json_evangeliste_403(self, tokens):
        r = requests.post(
            f"{API}/media/create-json",
            headers={**_hdr(tokens["evang"]), "Content-Type": "application/json"},
            json={
                "title": "TEST_ITER12_forbidden",
                "author": "T",
                "category": "Leadership",
                "kind": "audio",
            },
            timeout=15,
        )
        assert r.status_code == 403

    def test_upload_evangeliste_403(self, tokens):
        # Create as pasteur first
        r = requests.post(
            f"{API}/media/create-json",
            headers={**_hdr(tokens["pasteur"]), "Content-Type": "application/json"},
            json={
                "title": "TEST_ITER12_upload_rbac",
                "author": "T",
                "category": "Leadership",
                "kind": "audio",
            },
            timeout=15,
        )
        assert r.status_code == 201
        mid = r.json()["id"]
        try:
            r = requests.post(
                f"{API}/media/{mid}/upload",
                headers=_hdr(tokens["evang"]),
                data={"kind": "audio"},
                files={"file": ("t.wav", _silent_wav(0.1, 8000), "audio/wav")},
                timeout=30,
            )
            assert r.status_code == 403
        finally:
            requests.delete(f"{API}/media/{mid}", headers=_hdr(tokens["pasteur"]), timeout=15)


# ---------------- Pôle 1 / 2 smoke ---------------- #
class TestCrossPoleSmoke:
    def test_villes_ccmg(self, tokens):
        r = requests.get(f"{API}/villes", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        villes = r.json()
        ccmg = [v for v in villes if v.get("nom", "").startswith("CCMG ")]
        assert len(ccmg) >= 15, f"Expected >=15 CCMG villes, got {len(ccmg)}"

    def test_evenements_list(self, tokens):
        r = requests.get(f"{API}/evenements", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
