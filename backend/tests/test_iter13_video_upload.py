"""Iteration 13 — Video upload + streaming validation.

Focus:
  - POST /api/media/create-json with kind='video' returns 201.
  - POST /api/media/{id}/upload with kind='audio' + a MP4 file (content-type video/mp4)
    returns 200 and audio_path='udamg/media/{id}/audio.mp4', kind stays 'video'.
  - GET /api/media/{id}/file with Range: bytes=0-1 returns 206 with
    Content-Type video/mp4 (or at least starts with 'video/') and Content-Range 'bytes 0-1/{total}'.
  - Regression iter 12: audio-only Range still returns 206.
  - Regression iter 11: audio create-json + upload flow still works.
"""
import os
import struct

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://church-connect-255.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PASTEUR = ("admin@udamg.app", "AdminUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {"pasteur": _login(*PASTEUR), "evang": _login(*EVANG)}


# ---------- Fake MP4 bytes (ftyp box header — valid enough for storage) ---------- #
def _fake_mp4(size: int = 2048) -> bytes:
    """Return bytes that begin like a MP4 (ftyp box) followed by random-ish data.
    This is NOT a playable MP4 but is sufficient to test the upload/streaming pipeline
    end-to-end at the HTTP layer (Range + Content-Type)."""
    ftyp = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41"
    padding = (b"\xAB\xCD\xEF\x00" * ((size - len(ftyp)) // 4 + 1))[: size - len(ftyp)]
    blob = ftyp + padding
    assert len(blob) == size
    return blob


def _silent_wav(duration_sec: float = 1.0, sample_rate: int = 8000) -> bytes:
    num_samples = int(sample_rate * duration_sec)
    data = b"\x00" * num_samples
    header = b"RIFF" + struct.pack("<I", 36 + num_samples) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate, 1, 8)
    header += b"data" + struct.pack("<I", num_samples)
    return header + data


# ---------- Fixtures ---------- #
@pytest.fixture(scope="module")
def video_media(tokens):
    """Create a media with kind='video' + upload a fake MP4."""
    mp4_bytes = _fake_mp4(2048)
    total = len(mp4_bytes)

    # 1) create-json with kind=video
    r = requests.post(
        f"{API}/media/create-json",
        headers={**_hdr(tokens["pasteur"]), "Content-Type": "application/json"},
        json={
            "title": "TEST_ITER13_Video",
            "author": "TEST_Author",
            "category": "Enseignements du Dimanche",
            "kind": "video",
            "description": "Video upload test",
        },
        timeout=15,
    )
    assert r.status_code == 201, f"create-json video failed {r.status_code}: {r.text}"
    body = r.json()
    assert body["kind"] == "video"
    assert body["audio_path"] is None
    mid = body["id"]

    # 2) upload with kind='audio' + MP4 file (content-type video/mp4)
    r = requests.post(
        f"{API}/media/{mid}/upload",
        headers=_hdr(tokens["pasteur"]),
        data={"kind": "audio"},
        files={"file": ("clip.mp4", mp4_bytes, "video/mp4")},
        timeout=60,
    )
    assert r.status_code == 200, f"upload MP4 failed {r.status_code}: {r.text}"
    j = r.json()
    assert j["audio_path"] == f"udamg/media/{mid}/audio.mp4", f"unexpected audio_path: {j['audio_path']}"
    assert j["kind"] == "video", f"kind should stay 'video', got {j['kind']}"

    yield {"id": mid, "total": total}

    # cleanup
    r = requests.delete(f"{API}/media/{mid}", headers=_hdr(tokens["pasteur"]), timeout=15)
    assert r.status_code in (204, 404)


@pytest.fixture(scope="module")
def audio_media(tokens):
    """Create audio media for iter 11/12 regression."""
    wav = _silent_wav(1.0, 8000)
    total = len(wav)

    r = requests.post(
        f"{API}/media/create-json",
        headers={**_hdr(tokens["pasteur"]), "Content-Type": "application/json"},
        json={
            "title": "TEST_ITER13_Audio",
            "author": "TEST_Author",
            "category": "Leadership",
            "kind": "audio",
        },
        timeout=15,
    )
    assert r.status_code == 201
    mid = r.json()["id"]

    r = requests.post(
        f"{API}/media/{mid}/upload",
        headers=_hdr(tokens["pasteur"]),
        data={"kind": "audio"},
        files={"file": ("silent.wav", wav, "audio/wav")},
        timeout=60,
    )
    assert r.status_code == 200
    j = r.json()
    assert j["audio_path"] == f"udamg/media/{mid}/audio.wav"

    yield {"id": mid, "total": total}
    requests.delete(f"{API}/media/{mid}", headers=_hdr(tokens["pasteur"]), timeout=15)


# ---------------- VIDEO UPLOAD ---------------- #
class TestVideoUpload:
    def test_create_json_kind_video_returns_201(self, video_media):
        # Fixture already asserts. This is just a marker test.
        assert video_media["id"]

    def test_upload_mp4_writes_audio_mp4_and_keeps_kind_video(self, tokens, video_media):
        # Re-fetch to ensure persistence
        r = requests.get(f"{API}/media/{video_media['id']}", headers=_hdr(tokens["pasteur"]), timeout=15)
        assert r.status_code == 200
        m = r.json()
        assert m["kind"] == "video"
        assert m["audio_path"] == f"udamg/media/{video_media['id']}/audio.mp4"


# ---------------- VIDEO STREAM w/ RANGE ---------------- #
class TestVideoStream:
    def test_range_first_two_bytes_video_mp4(self, tokens, video_media):
        r = requests.get(
            f"{API}/media/{video_media['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=0-1"},
            timeout=30,
        )
        assert r.status_code == 206, f"Expected 206, got {r.status_code}: {r.text[:200]}"
        assert r.headers.get("Content-Range") == f"bytes 0-1/{video_media['total']}"
        assert r.headers.get("Content-Length") == "2"
        assert r.headers.get("Accept-Ranges") == "bytes"
        ct = r.headers.get("Content-Type", "")
        # ideally exact 'video/mp4', but also accept anything starting with 'video/'
        assert ct.startswith("video/"), f"Content-Type should be video/*, got '{ct}'"
        assert len(r.content) == 2

    def test_full_stream_video_returns_200(self, tokens, video_media):
        r = requests.get(
            f"{API}/media/{video_media['id']}/file",
            headers=_hdr(tokens["pasteur"]),
            timeout=30,
        )
        assert r.status_code == 200
        assert r.headers.get("Accept-Ranges") == "bytes"
        ct = r.headers.get("Content-Type", "")
        assert ct.startswith("video/"), f"Content-Type should be video/*, got '{ct}'"
        assert len(r.content) == video_media["total"]

    def test_video_range_middle_slice(self, tokens, video_media):
        r = requests.get(
            f"{API}/media/{video_media['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=100-200"},
            timeout=30,
        )
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 100-200/{video_media['total']}"
        assert r.headers.get("Content-Length") == "101"


# ---------------- REGRESSION iter 12 (audio Range) ---------------- #
class TestAudioRangeRegression:
    def test_audio_range_first_two_bytes(self, tokens, audio_media):
        r = requests.get(
            f"{API}/media/{audio_media['id']}/file",
            headers={**_hdr(tokens["pasteur"]), "Range": "bytes=0-1"},
            timeout=30,
        )
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 0-1/{audio_media['total']}"
        assert r.headers.get("Content-Length") == "2"
        assert r.content == b"RI"  # WAV starts with "RIFF"


# ---------------- REGRESSION iter 11 (audio create-json + upload) ---------------- #
class TestIter11AudioRegression:
    def test_audio_create_json_and_upload(self, audio_media):
        # covered by fixture; ensure it didn't 400 / 500
        assert audio_media["id"]
        assert audio_media["total"] > 100


# ---------------- RBAC (evangeliste can't create video) ---------------- #
class TestRBAC:
    def test_evangeliste_forbidden_video_create(self, tokens):
        r = requests.post(
            f"{API}/media/create-json",
            headers={**_hdr(tokens["evang"]), "Content-Type": "application/json"},
            json={
                "title": "TEST_ITER13_Refused",
                "author": "X",
                "category": "Leadership",
                "kind": "video",
            },
            timeout=15,
        )
        assert r.status_code == 403
