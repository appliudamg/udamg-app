"""Emails transactionnels via Brevo (bienvenue / nouveau mot de passe / badge d'inscription)."""
import base64
import html
import os
from datetime import datetime
from typing import Optional, Tuple

import httpx

from core import logger

BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "appli.udamg@gmail.com")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "UDAMG APP")
APP_URL = os.environ.get("APP_PUBLIC_URL", "https://udamg-app.vercel.app")
APP_STORE_URL = os.environ.get("APP_STORE_URL", "").strip()
PLAY_STORE_URL = os.environ.get("PLAY_STORE_URL", "").strip()
SHOW_WEB_LINK = os.environ.get("EMAIL_SHOW_WEB_LINK", "true").lower() != "false"

ROLE_LABELS = {
    "admin": "Admin", "equipe_technique": "Équipe technique", "pasteur": "Pasteur", "missionnaire": "Missionnaire",
    "berger": "Berger", "leader": "Leader", "ouvrier": "Ouvrier", "disciple": "Disciple", "membre": "Membre",
}


def _template(title: str, intro: str, user: dict, password: str) -> str:
    e = html.escape
    stores = ""
    if APP_STORE_URL:
        stores += f'<a href="{APP_STORE_URL}" style="display:inline-block;margin:6px;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold"> App Store</a>'
    if PLAY_STORE_URL:
        stores += f'<a href="{PLAY_STORE_URL}" style="display:inline-block;margin:6px;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">▶ Google Play</a>'
    access_row = ""
    if stores:
        access_row = '<tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC;width:40%"><b>Application</b></td><td style="padding:8px;border:1px solid #E2E8F0">Téléchargez UDAMG APP sur votre téléphone (boutons ci-dessous)</td></tr>'
    elif SHOW_WEB_LINK:
        access_row = f'<tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC;width:40%"><b>Application</b></td><td style="padding:8px;border:1px solid #E2E8F0"><a href="{APP_URL}">{APP_URL}</a></td></tr>'
    if stores:
        cta = f'<p style="text-align:center;margin:24px 0">{stores}</p>'
        if SHOW_WEB_LINK:
            cta += f'<p style="text-align:center;color:#64748B;font-size:13px">Accès web : <a href="{APP_URL}">{APP_URL}</a></p>'
    elif SHOW_WEB_LINK:
        cta = f'<p style="text-align:center;margin:24px 0"><a href="{APP_URL}" style="background:#0047AB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Ouvrir l\'application</a></p>'
    else:
        cta = ""
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
      {access_row}
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Identifiant</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(user['email'])}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Mot de passe</b></td><td style="padding:8px;border:1px solid #E2E8F0"><code style="font-size:15px">{e(password)}</code></td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Rôle</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(ROLE_LABELS.get(user.get('role', ''), user.get('role', '')))}</td></tr>
    </table>
    {cta}
    <p style="color:#64748B;font-size:13px">Pensez à changer votre mot de passe dans <b>Profil → Changer mon mot de passe</b>. Cet email a été envoyé automatiquement par UDAMG APP.</p>
  </div>
</div>"""


def _post_brevo(payload: dict) -> Tuple[bool, Optional[str]]:
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


def send_badge_email(participant: dict, event: dict, qr_png: bytes, badge_url: str,
                     registered_by: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """Envoie le badge numérique (QR en pièce jointe + lien) au participant. Retourne (envoyé, erreur)."""
    if not BREVO_API_KEY:
        return False, "Clé Brevo absente"
    if not participant.get("email"):
        return False, "Aucun email"
    e = html.escape
    when = ""
    try:
        d = datetime.fromisoformat(str(event.get("date", "")).replace("Z", "+00:00"))
        when = d.strftime("%d/%m/%Y à %H:%M")
    except ValueError:
        when = str(event.get("date", ""))
    lieu = " · ".join(x for x in [event.get("lieu"), event.get("ville")] if x)
    intro = (f"{e(registered_by)} vous a inscrit(e) à l'événement" if registered_by else "Votre inscription à l'événement") \
        + f" <b>{e(event.get('titre', ''))}</b> est confirmée. Voici votre badge numérique : présentez le QR code (en pièce jointe ou via le lien) à l'entrée pour être pointé(e)."
    body = f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#0047AB;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:22px;letter-spacing:1px">UDAMG APP</h1>
    <p style="margin:6px 0 0;opacity:.9;font-style:italic">Sauvé par Grâce pour Sauver</p>
  </div>
  <div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
    <h2 style="margin-top:0;font-size:18px">Votre badge d'inscription</h2>
    <p>Bonjour {e(participant.get('prenom', ''))} {e(participant.get('nom', ''))},</p>
    <p>{intro}</p>
    <div style="border:2px solid #D4A017;border-radius:12px;padding:16px;text-align:center;margin:16px 0">
      <div style="font-size:12px;letter-spacing:2px;color:#64748B">BADGE</div>
      <div style="font-size:26px;font-weight:bold;color:#0047AB;letter-spacing:2px">{e(participant.get('badge_id', ''))}</div>
      <div style="margin-top:6px;font-weight:bold">{e(participant.get('prenom', ''))} {e(participant.get('nom', ''))}</div>
      <div style="color:#64748B;font-size:13px">{e(participant.get('profil', ''))}{(' · ' + e(participant['eglise'])) if participant.get('eglise') else ''}</div>
    </div>
    <table style="border-collapse:collapse;margin:16px 0;width:100%">
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC;width:40%"><b>Événement</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(event.get('titre', ''))}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Date</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(when)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2E8F0;background:#F8FAFC"><b>Lieu</b></td><td style="padding:8px;border:1px solid #E2E8F0">{e(lieu)}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0"><a href="{badge_url}" style="background:#0047AB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Afficher mon badge QR</a></p>
    <p style="color:#64748B;font-size:13px">Le QR code est également joint à cet email (image PNG). Cet email a été envoyé automatiquement par UDAMG APP.</p>
  </div>
</div>"""
    payload = {
        "sender": {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
        "to": [{"email": participant["email"], "name": f"{participant.get('prenom', '')} {participant.get('nom', '')}".strip() or participant["email"]}],
        "subject": f"Votre badge — {event.get('titre', 'Événement UDAMG')}",
        "htmlContent": body,
        "attachment": [{"content": base64.b64encode(qr_png).decode("ascii"), "name": f"badge-{participant.get('badge_id', 'UDAMG')}.png"}],
    }
    return _post_brevo(payload)


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
    return _post_brevo(payload)
