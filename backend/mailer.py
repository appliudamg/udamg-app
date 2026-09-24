"""Emails transactionnels via Brevo (bienvenue / nouveau mot de passe)."""
import html
import os
from typing import Optional, Tuple

import httpx

from core import logger

BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "appli.udamg@gmail.com")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "UDAMG APP")
APP_URL = os.environ.get("APP_PUBLIC_URL", "https://udamg-app.vercel.app")

ROLE_LABELS = {
    "admin": "Admin", "equipe_technique": "Équipe technique", "pasteur": "Pasteur", "missionnaire": "Missionnaire",
    "berger": "Berger", "leader": "Leader", "ouvrier": "Ouvrier", "disciple": "Disciple", "membre": "Membre",
}


def _template(title: str, intro: str, user: dict, password: str) -> str:
    e = html.escape
    return f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#0047AB;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:22px;letter-spacing:1px">UDAMG APP</h1>
    <p style="margin:6px 0 0;opacity:.9;font-style:italic">Sauvé par Grâce pour Sauver</p>
  </div>
  <div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
    <h2 style="margin-top:0;font-size:18px">{e(title)}</h2>
    <p>Bonjour {e(user.get('prenom', ''))} {e(user.get('nom', ''))},</p>
    <p>{intro}</p>
    <table style="border-collapse:collapse;margin:16px 0;width:100%">
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC;width:40%"><b>Application</b></td><td style="padding:8px;border:1px solid #E2E8F0"><a href="{APP_URL}">{APP_URL}</a></td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Identifiant</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(user['email'])}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Mot de passe</b></td><td style="padding:8px;border:1px solid #E2E8F0"><code style="font-size:15px">{e(password)}</code></td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Rôle</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(ROLE_LABELS.get(user.get('role', ''), user.get('role', '')))}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0">
      <a href="{APP_URL}" style="background:#0047AB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Ouvrir l'application</a>
    </p>
    <p style="color:#64748B;font-size:13px">Pensez à changer votre mot de passe dans <b>Profil → Changer mon mot de passe</b>. Cet email a été envoyé automatiquement par UDAMG APP.</p>
  </div>
</div>"""


def send_credentials_email(user: dict, password: str, reset: bool = False) -> Tuple[bool, Optional[str]]:
    """Retourne (envoyé, message d'erreur). N'interrompt jamais la création du compte."""
    if not BREVO_API_KEY:
        return False, "Clé Brevo absente"
    if reset:
        subject = "UDAMG APP — votre nouveau mot de passe"
        body = _template("Nouveau mot de passe", "Votre mot de passe d'accès à l'application UDAMG a été réinitialisé par un administrateur. Voici vos nouveaux identifiants :", user, password)
    else:
        subject = "Bienvenue sur UDAMG APP — vos accès"
        body = _template("Bienvenue dans l'équipe UDAMG", "Un administrateur vient de créer votre compte sur l'application UDAMG. Voici vos identifiants de connexion :", user, password)
    payload = {
        "sender": {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
        "to": [{"email": user["email"], "name": f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or user["email"]}],
        "subject": subject,
        "htmlContent": body,
    }
    try:
        r = httpx.post("https://api.brevo.com/v3/smtp/email", json=payload, timeout=15.0,
                       headers={"accept": "application/json", "content-type": "application/json", "api-key": BREVO_API_KEY})
    except httpx.HTTPError as exc:
        logger.warning("Brevo injoignable : %s", exc)
        return False, "Service email injoignable"
    if r.status_code == 201:
        return True, None
    try:
        detail = r.json()
    except ValueError:
        detail = {}
    msg = detail.get("message") or f"Brevo HTTP {r.status_code}"
    if "unrecognised IP" in msg:
        msg = "Brevo bloque l'adresse IP du serveur — désactivez la restriction d'IP dans Brevo (Sécurité → IP autorisées)"
    logger.warning("Brevo refus (%s) : %s", r.status_code, msg)
    return False, msg
