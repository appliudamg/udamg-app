"""Iteration 16 — stream_url on /media + Stories feature + faststart moov-before-mdat.

Runs against local backend (http://localhost:8001/api by default) — same host uvicorn
that also handles Supabase creds. We create small TEST_ items and clean up after.
"""
import io
import os
import struct
import time
import uuid

import pytest
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
SUPABASE_HOST = "https://olehhoovstiheycdarhs.supabase.co"

CREDS = {
    "admin": ("admin@udamg.app", "AdminUdamg2026!"),
    "technique": ("technique@udamg.app", "TechUdamg2026!"),
    "pasteur": ("pasteur@udamg.app", "PasteurUdamg2026!"),
    "membre": ("membre@udamg.app", "MembreUdamg2026!"),
}


# -------- fixtures ------------------------------------------------------------
@pytest.fixture(scope="module")
def tokens():
    t = {}
    for role, (email, pwd) in CREDS.items():
        r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=15)
        assert r.status_code == 200, f"login {role}: {r.status_code} {r.text}"
        t[role] = r.json()["access_token"]
    return t


def h(t):
    return {"Authorization": f"Bearer {t}"}


# ==================== 1. /media stream_url ====================================
class TestMediaStreamUrl:
    def test_list_returns_stream_url_and_supabase_host(self, tokens):
        r = requests.get(f"{BASE}/media", headers=h(tokens["technique"]), timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        with_audio = [i for i in items if i.get("audio_path")]
        assert with_audio, "no media with audio_path — cannot verify stream_url"
        for it in with_audio:
            url = it.get("stream_url")
            assert url, f"item {it['id']} has audio_path but no stream_url"
            assert url.startswith(f"{SUPABASE_HOST}/storage/v1/object/sign/media/"), url

    def test_stream_url_supports_range_requests(self, tokens):
        items = requests.get(f"{BASE}/media", headers=h(tokens["technique"])).json()
        target = next((i for i in items if i.get("audio_path")), None)
        assert target
        r = requests.get(target["stream_url"], headers={"Range": "bytes=0-1"}, timeout=15)
        assert r.status_code == 206, f"expected 206 got {r.status_code}"
        assert len(r.content) == 2

    def test_m4a_or_mp4_has_moov_before_mdat(self, tokens):
        items = requests.get(f"{BASE}/media", headers=h(tokens["technique"])).json()
        candidates = [i for i in items
                      if i.get("audio_path")
                      and i["audio_path"].rsplit(".", 1)[-1].lower() in ("m4a", "mp4", "m4v", "mov")]
        if not candidates:
            pytest.skip("no m4a/mp4 media items to check faststart on")
        checked = 0
        for it in candidates:
            r = requests.get(it["stream_url"], headers={"Range": "bytes=0-2047"}, timeout=15)
            assert r.status_code in (200, 206)
            data = r.content
            moov = data.find(b"moov")
            mdat = data.find(b"mdat")
            # In faststart layout, moov must appear before mdat within the first bytes.
            # mdat may not appear at all in first 2KB — that's fine, moov is what matters.
            assert moov != -1, f"'moov' atom not found in first 2KB of {it['id']} ({it['audio_path']})"
            if mdat != -1:
                assert moov < mdat, f"moov({moov}) after mdat({mdat}) — file NOT faststart-optimized: {it['audio_path']}"
            checked += 1
        assert checked >= 1

    def test_get_media_by_id_has_stream_url(self, tokens):
        items = requests.get(f"{BASE}/media", headers=h(tokens["technique"])).json()
        target = next((i for i in items if i.get("audio_path")), None)
        r = requests.get(f"{BASE}/media/{target['id']}", headers=h(tokens["technique"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("stream_url", "").startswith(f"{SUPABASE_HOST}/storage/v1/object/sign/media/")

    def test_favorites_still_work(self, tokens):
        r = requests.get(f"{BASE}/media/favorites/list", headers=h(tokens["technique"]), timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_progress_continue_still_works(self, tokens):
        r = requests.get(f"{BASE}/media/progress/continue", headers=h(tokens["technique"]), timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)


# ==================== 2. Media upload flow (round-trip w/ faststart) ==========
def _tiny_mp3():
    # 32 bytes of ID3v2 header + a couple silent frame bytes; enough for storage.
    return b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512


class TestMediaUploadRoundTrip:
    created_id = None
    audio_path = None

    def test_create_upload_confirm_stream_url_delete(self, tokens):
        token = tokens["technique"]
        title = f"TEST_ITER16_{uuid.uuid4().hex[:8]}"
        # create
        r = requests.post(f"{BASE}/media/create-json", headers=h(token),
                          json={"title": title, "author": "TEST", "category": "podcasts",
                                "kind": "audio"}, timeout=15)
        assert r.status_code == 201, r.text
        mid = r.json()["id"]
        TestMediaUploadRoundTrip.created_id = mid
        # upload url
        r = requests.post(f"{BASE}/media/{mid}/upload-url", headers=h(token),
                          json={"field": "audio", "filename": "tiny.mp3",
                                "content_type": "audio/mpeg"}, timeout=15)
        assert r.status_code == 200, r.text
        up = r.json()
        assert up["upload_url"] and up["path"]
        path = up["path"]
        # PUT tiny body directly to supabase
        r = requests.put(up["upload_url"], data=_tiny_mp3(),
                         headers={"Content-Type": "audio/mpeg",
                                  "Authorization": f"Bearer {up['token']}"} if False else
                                 {"Content-Type": "audio/mpeg", "x-upsert": "true"}, timeout=30)
        assert r.status_code in (200, 201), f"upload PUT: {r.status_code} {r.text[:200]}"
        # confirm
        r = requests.post(f"{BASE}/media/{mid}/confirm", headers=h(token),
                          json={"field": "audio", "path": path, "content_type": "audio/mpeg"},
                          timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("audio_path") == path
        assert d.get("stream_url", "").startswith(f"{SUPABASE_HOST}/storage/v1/object/sign/media/"), d.get("stream_url")
        TestMediaUploadRoundTrip.audio_path = path

    def test_zzz_cleanup_media(self, tokens):
        if not TestMediaUploadRoundTrip.created_id:
            pytest.skip("nothing to clean")
        r = requests.delete(f"{BASE}/media/{TestMediaUploadRoundTrip.created_id}",
                            headers=h(tokens["technique"]), timeout=15)
        assert r.status_code in (204, 200)


# ==================== 3. Stories feature ======================================
# 1x1 transparent PNG
TINY_PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
            b"\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82")


class TestStories:
    story_id = None

    def test_create_rbac_admin_forbidden(self, tokens):
        r = requests.post(f"{BASE}/stories/create-json", headers=h(tokens["admin"]),
                          json={"kind": "image", "caption": "TEST_story", "duration_hours": 24}, timeout=15)
        assert r.status_code == 403, r.status_code

    def test_create_rbac_membre_forbidden(self, tokens):
        r = requests.post(f"{BASE}/stories/create-json", headers=h(tokens["membre"]),
                          json={"kind": "image", "caption": "TEST_story", "duration_hours": 24}, timeout=15)
        assert r.status_code == 403

    def test_create_as_technique_201(self, tokens):
        r = requests.post(f"{BASE}/stories/create-json", headers=h(tokens["technique"]),
                          json={"kind": "image", "caption": "TEST_ITER16_story", "duration_hours": 24}, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["kind"] == "image"
        assert d["caption"] == "TEST_ITER16_story"
        assert d["media_path"] is None
        TestStories.story_id = d["id"]

    def test_story_without_media_hidden_from_list(self, tokens):
        r = requests.get(f"{BASE}/stories", headers=h(tokens["membre"]), timeout=15)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert TestStories.story_id not in ids, "story with no media_path must NOT appear"

    def test_upload_url_put_confirm(self, tokens):
        sid = TestStories.story_id
        r = requests.post(f"{BASE}/stories/{sid}/upload-url", headers=h(tokens["technique"]),
                          json={"filename": "a.png", "content_type": "image/png"}, timeout=15)
        assert r.status_code == 200, r.text
        up = r.json()
        assert up["upload_url"] and up["path"]
        r2 = requests.put(up["upload_url"], data=TINY_PNG,
                          headers={"Content-Type": "image/png", "x-upsert": "true"}, timeout=30)
        assert r2.status_code in (200, 201), f"PUT: {r2.status_code} {r2.text[:200]}"
        r3 = requests.post(f"{BASE}/stories/{sid}/confirm", headers=h(tokens["technique"]),
                           json={"path": up["path"]}, timeout=15)
        assert r3.status_code == 200, r3.text
        d = r3.json()
        assert d["url"].startswith(f"{SUPABASE_HOST}/storage/v1/object/public/stories/"), d["url"]

    def test_membre_sees_story_viewed_false(self, tokens):
        r = requests.get(f"{BASE}/stories", headers=h(tokens["membre"]), timeout=15)
        assert r.status_code == 200
        target = next((s for s in r.json() if s["id"] == TestStories.story_id), None)
        assert target is not None, "confirmed story must appear in GET /stories for membre"
        assert target["viewed"] is False
        assert target["views_count"] == 0

    def test_membre_view_and_reflect(self, tokens):
        sid = TestStories.story_id
        r = requests.post(f"{BASE}/stories/{sid}/view", headers=h(tokens["membre"]), timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE}/stories", headers=h(tokens["membre"]), timeout=15)
        target = next((s for s in r2.json() if s["id"] == sid), None)
        assert target["viewed"] is True, target
        assert target["views_count"] >= 1

    def test_viewers_rbac(self, tokens):
        sid = TestStories.story_id
        r_ok = requests.get(f"{BASE}/stories/{sid}/viewers", headers=h(tokens["technique"]), timeout=15)
        assert r_ok.status_code == 200
        viewers = r_ok.json()
        emails_roles = {v.get("role") for v in viewers}
        assert "membre" in emails_roles, f"membre must be in viewers: {viewers}"
        r_no = requests.get(f"{BASE}/stories/{sid}/viewers", headers=h(tokens["membre"]), timeout=15)
        assert r_no.status_code == 403

    def test_patch_caption(self, tokens):
        sid = TestStories.story_id
        r = requests.patch(f"{BASE}/stories/{sid}", headers=h(tokens["technique"]),
                           json={"caption": "TEST_ITER16_edited"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["caption"] == "TEST_ITER16_edited"

    def test_delete_rbac(self, tokens):
        sid = TestStories.story_id
        r = requests.delete(f"{BASE}/stories/{sid}", headers=h(tokens["membre"]), timeout=15)
        assert r.status_code == 403

    def test_delete_as_technique(self, tokens):
        sid = TestStories.story_id
        r = requests.delete(f"{BASE}/stories/{sid}", headers=h(tokens["technique"]), timeout=15)
        assert r.status_code == 204
        # verify gone
        r2 = requests.get(f"{BASE}/stories", headers=h(tokens["technique"]), timeout=15)
        ids = [s["id"] for s in r2.json()]
        assert sid not in ids
