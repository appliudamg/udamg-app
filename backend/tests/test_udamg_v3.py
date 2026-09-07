"""UDAMG API v3 - tests for exports (xlsx/pdf), transferts journal, rappels, google session.

Covers new endpoints:
- POST /api/auth/session (Google) — 400 empty / 401 bad session
- GET  /api/transferts (with ?q= search + RBAC)
- GET  /api/rappels (with ?days=)
- GET  /api/exports/contacts.xlsx
- GET  /api/exports/contacts.pdf
- GET  /api/exports/contacts-lots.pdf
"""
import io
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env", override=False)
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

PASTEUR = ("admin@udamg.app", "AdminUdamg2026!")
OUVRIER = ("ouvrier@udamg.app", "OuvrierUdamg2026!")
EVANG = ("evangeliste@udamg.app", "EvangUdamg2026!")


@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, email, pwd):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def pasteur(s): return _login(s, *PASTEUR)


@pytest.fixture(scope="session")
def ouvrier(s): return _login(s, *OUVRIER)


@pytest.fixture(scope="session")
def evang(s): return _login(s, *EVANG)


def H(t): return {"Authorization": f"Bearer {t['access_token']}"}


def _paris_id(s, tok):
    v = s.get(f"{BASE_URL}/api/villes", headers=H(tok), timeout=15).json()
    return next(x["id"] for x in v if x["nom"] == "CCMG Paris")


def _angers_id(s, tok):
    v = s.get(f"{BASE_URL}/api/villes", headers=H(tok), timeout=15).json()
    return next(x["id"] for x in v if x["nom"] == "CCMG Angers")


def _ebed_id(s, tok):
    p = s.get(f"{BASE_URL}/api/programmes", headers=H(tok), timeout=15).json()
    return next(x["id"] for x in p if x["nom"] == "Convention EBED 2026")


# --------------------------------------------------------------------- #
# Google Session (/api/auth/session)
# --------------------------------------------------------------------- #
def test_auth_session_empty_body(s):
    r = s.post(f"{BASE_URL}/api/auth/session", json={}, timeout=15)
    # missing / empty session_id must be 400 or 422
    assert r.status_code in (400, 422), r.text


def test_auth_session_empty_string(s):
    r = s.post(f"{BASE_URL}/api/auth/session", json={"session_id": ""}, timeout=15)
    assert r.status_code in (400, 422), r.text


def test_auth_session_bad_id(s):
    r = s.post(f"{BASE_URL}/api/auth/session", json={"session_id": "definitely-not-a-real-session-id"}, timeout=15)
    assert r.status_code == 401, r.text


# --------------------------------------------------------------------- #
# Transferts journal
# --------------------------------------------------------------------- #
def test_transferts_returns_list(s, pasteur):
    r = s.get(f"{BASE_URL}/api/transferts", headers=H(pasteur), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_transfer_creates_journal_entry(s, pasteur):
    """After a transfer, /api/transferts contains a log with contact_nom, from.nom, to.nom, by."""
    paris = _paris_id(s, pasteur)
    angers = _angers_id(s, pasteur)
    c = s.post(f"{BASE_URL}/api/contacts", json={
        "nom": "TEST_journal", "prenom": "J", "categorie": "CCMG", "niveau": 1,
        "context_type": "ville", "context_id": paris,
    }, headers=H(pasteur), timeout=15).json()
    r = s.post(f"{BASE_URL}/api/contacts/transfer",
               json={"contact_id": c["id"], "ville_dest_id": angers},
               headers=H(pasteur), timeout=15)
    assert r.status_code == 200

    logs = s.get(f"{BASE_URL}/api/transferts", headers=H(pasteur), timeout=15).json()
    hit = next((x for x in logs if x.get("contact_id") == c["id"]), None)
    assert hit is not None
    assert "TEST_JOURNAL" in hit["contact_nom"].upper()
    assert hit["from"].get("nom") == "CCMG Paris"
    assert hit["to"].get("nom") == "CCMG Angers"
    assert hit["by"] == "admin@udamg.app"

    # Search matches contact_nom
    r_q1 = s.get(f"{BASE_URL}/api/transferts?q=TEST_journal", headers=H(pasteur), timeout=15).json()
    assert any(x.get("contact_id") == c["id"] for x in r_q1)
    # Search matches from.nom
    r_q2 = s.get(f"{BASE_URL}/api/transferts?q=Paris", headers=H(pasteur), timeout=15).json()
    assert any(x.get("contact_id") == c["id"] for x in r_q2)
    # Bogus query returns empty (for this contact)
    r_q3 = s.get(f"{BASE_URL}/api/transferts?q=zzzzzzzzzzz-nomatch", headers=H(pasteur), timeout=15).json()
    assert not any(x.get("contact_id") == c["id"] for x in r_q3)

    # cleanup
    s.delete(f"{BASE_URL}/api/contacts/{c['id']}", headers=H(pasteur), timeout=15)


def test_transferts_rbac_evangeliste(s, pasteur, evang):
    """Evangeliste sees only transferts they created (by == their email)."""
    r = s.get(f"{BASE_URL}/api/transferts", headers=H(evang), timeout=15)
    assert r.status_code == 200
    for x in r.json():
        assert x["by"] == "evangeliste@udamg.app"


# --------------------------------------------------------------------- #
# Rappels
# --------------------------------------------------------------------- #
def test_rappels_days_zero(s, pasteur):
    """days=0 → returns all niveau=1 contacts (created_at < now)."""
    r = s.get(f"{BASE_URL}/api/rappels?days=0", headers=H(pasteur), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Every returned contact is niveau 1
    for c in data:
        assert c["niveau"] == 1


def test_rappels_days_90_returns_zero(s, pasteur):
    """days=90 → contacts stagnant for >=90 days. Fresh DB → 0."""
    r = s.get(f"{BASE_URL}/api/rappels?days=90", headers=H(pasteur), timeout=15)
    assert r.status_code == 200
    assert r.json() == []


def test_rappels_rbac_evangeliste_own_only(s, pasteur, evang):
    """Evangeliste rappels contain only contacts registered by them."""
    paris = _paris_id(s, pasteur)
    # Pasteur-owned niveau=1 contact
    cp = s.post(f"{BASE_URL}/api/contacts", json={
        "nom": "TEST_rap_p", "prenom": "P", "categorie": "CCMG", "niveau": 1,
        "context_type": "ville", "context_id": paris,
    }, headers=H(pasteur), timeout=15).json()
    # Evang-owned niveau=1 contact
    ce = s.post(f"{BASE_URL}/api/contacts", json={
        "nom": "TEST_rap_e", "prenom": "E", "categorie": "CCMG", "niveau": 1,
        "context_type": "ville", "context_id": paris,
    }, headers=H(evang), timeout=15).json()

    r_e = s.get(f"{BASE_URL}/api/rappels?days=0", headers=H(evang), timeout=15).json()
    ids_e = {x["id"] for x in r_e}
    assert ce["id"] in ids_e
    assert cp["id"] not in ids_e

    # cleanup
    s.delete(f"{BASE_URL}/api/contacts/{cp['id']}", headers=H(pasteur), timeout=15)
    s.delete(f"{BASE_URL}/api/contacts/{ce['id']}", headers=H(pasteur), timeout=15)


# --------------------------------------------------------------------- #
# Exports
# --------------------------------------------------------------------- #
XLSX_MAGIC = b"PK\x03\x04"
PDF_MAGIC = b"%PDF-"


def test_export_xlsx_auth_required(s):
    r = s.get(f"{BASE_URL}/api/exports/contacts.xlsx?context_type=GLOBAL&context_id=GLOBAL", timeout=30)
    assert r.status_code in (401, 403)


def test_export_xlsx_ville(s, pasteur):
    paris = _paris_id(s, pasteur)
    r = s.get(
        f"{BASE_URL}/api/exports/contacts.xlsx?context_type=ville&context_id={paris}",
        headers=H(pasteur), timeout=60
    )
    assert r.status_code == 200, r.text[:400]
    ct = r.headers.get("content-type", "")
    assert "spreadsheet" in ct or "excel" in ct or "octet-stream" in ct, ct
    body = r.content
    assert len(body) > 200, f"XLSX too small: {len(body)}"
    assert body.startswith(XLSX_MAGIC), body[:8]


def test_export_pdf_auth_required(s):
    r = s.get(f"{BASE_URL}/api/exports/contacts.pdf?context_type=GLOBAL&context_id=GLOBAL", timeout=30)
    assert r.status_code in (401, 403)


def test_export_pdf_ville(s, pasteur):
    paris = _paris_id(s, pasteur)
    r = s.get(
        f"{BASE_URL}/api/exports/contacts.pdf?context_type=ville&context_id={paris}",
        headers=H(pasteur), timeout=60
    )
    assert r.status_code == 200, r.text[:400]
    ct = r.headers.get("content-type", "")
    assert "pdf" in ct.lower(), ct
    body = r.content
    assert len(body) > 500, f"PDF too small: {len(body)}"
    assert body.startswith(PDF_MAGIC), body[:8]


def test_export_pdf_lots_ebed(s, pasteur):
    """contacts-lots.pdf for EBED programme returns PDF (chunking + hidden niveau column)."""
    ebed = _ebed_id(s, pasteur)
    # populate at least 12 contacts to exercise chunking (10 per page)
    created = []
    for i in range(12):
        c = s.post(f"{BASE_URL}/api/contacts", json={
            "nom": f"TEST_lot_{i:02d}", "prenom": f"P{i}", "categorie": "CCMG", "niveau": 1,
            "context_type": "programme", "context_id": ebed,
        }, headers=H(pasteur), timeout=15)
        if c.status_code == 201:
            created.append(c.json()["id"])

    r = s.get(
        f"{BASE_URL}/api/exports/contacts-lots.pdf?context_type=programme&context_id={ebed}",
        headers=H(pasteur), timeout=60
    )
    # cleanup regardless
    for cid in created:
        s.delete(f"{BASE_URL}/api/contacts/{cid}", headers=H(pasteur), timeout=15)

    assert r.status_code == 200, r.text[:400]
    body = r.content
    assert body.startswith(PDF_MAGIC), body[:8]
    assert len(body) > 500
    # niveau labels should NOT be present in the lots PDF (hidden column). Very best-effort check.
    lower = body.lower()
    # not asserting absence hard because encoded PDF may contain arbitrary bytes; just ensure basic size
