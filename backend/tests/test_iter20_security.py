"""Itération 20 — correctifs de l'audit sécurité (SEC-001 → SEC-005 + durcissements)."""
import os
import requests

API = os.environ.get("API_URL", "http://localhost:8001/api")
CREDS = {"admin": ("admin@udamg.app", "AdminUdamg2026!"), "membre": ("test.membre@udamg.app", "MembreTest2026!")}


def login(role):
    r = requests.post(f"{API}/auth/login", json={"email": CREDS[role][0], "password": CREDS[role][1]}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_sec002_membre_cannot_list_or_export():
    hm, ha = login("membre"), login("admin")
    eid = requests.get(f"{API}/evenements", headers=hm, timeout=30).json()[0]["id"]
    for path in (f"/event/participants?evenement_id={eid}", f"/event/dashboard?evenement_id={eid}",
                 f"/event/exports/participants.csv?evenement_id={eid}", f"/event/pointages?evenement_id={eid}", "/users"):
        assert requests.get(f"{API}{path}", headers=hm, timeout=30).status_code == 403, path
    assert requests.get(f"{API}/users", headers=ha, timeout=30).status_code == 200


def test_sec001_badge_page_requires_token_and_hides_pii():
    ha = login("admin")
    eid = requests.get(f"{API}/evenements", headers=ha, timeout=30).json()[0]["id"]
    parts = requests.get(f"{API}/event/participants?evenement_id={eid}", headers=ha, timeout=30).json()
    if not parts:
        return
    p = parts[0]
    assert requests.get(f"{API}/event/participants/by-badge/{p['badge_id']}", params={"evenement_id": eid}, timeout=30).status_code == 404
    r = requests.get(f"{API}/event/participants/by-badge/{p['badge_id']}", params={"evenement_id": eid, "t": p["badge_token"]}, timeout=30)
    assert r.status_code == 200
    assert "email" not in r.json() and "tel" not in r.json() and "notes" not in r.json()


def test_sec003_register_push_requires_auth():
    assert requests.post(f"{API}/register-push", json={"user_id": "x", "platform": "ios", "device_token": "a"}, timeout=30).status_code == 401


def test_password_policy():
    ha, hm = login("admin"), login("membre")
    r = requests.post(f"{API}/admin/users", json={"email": "weak.pwd@gmail.com", "nom": "Weak", "prenom": "Pwd", "role": "membre", "password": "abcdefghij"}, headers=ha, timeout=30)
    assert r.status_code == 422
    assert requests.post(f"{API}/auth/password", json={"current_password": "x", "new_password": "short1"}, headers=hm, timeout=30).status_code == 422


def test_login_lockout_after_failures():
    for _ in range(5):
        requests.post(f"{API}/auth/login", json={"email": "lockout.test@gmail.com", "password": "wrong"}, timeout=30)
    assert requests.post(f"{API}/auth/login", json={"email": "lockout.test@gmail.com", "password": "wrong"}, timeout=30).status_code == 429


def test_cors_unknown_origin_rejected():
    r = requests.options(f"{API}/evenements", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}, timeout=30)
    assert r.headers.get("access-control-allow-origin") is None
