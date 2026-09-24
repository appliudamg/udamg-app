"""Notifications push — relais Emergent (SuprSend). Le backend seul parle au service."""
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import logger

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

router = APIRouter(prefix="/api")


def _client() -> httpx.Client:
    return httpx.Client(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@router.post("/register-push", status_code=201)
def register_push(body: RegisterPushBody):
    with _client() as c:
        resp = c.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    """Envoie une notification à ≤ 100 destinataires (ids utilisateurs). data = {title, message, action_url?}."""
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call; chunk before sending")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    with _client() as c:
        resp = c.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


def broadcast_push(user_ids: List[str], title: str, message: str, action_url: Optional[str] = None, key: Optional[str] = None) -> None:
    """Diffuse à tous les utilisateurs par lots de 100 ; n'interrompt jamais l'opération principale."""
    data = {"title": title[:80], "message": message[:200]}
    if action_url:
        data["action_url"] = action_url
    for i in range(0, len(user_ids), 100):
        chunk = user_ids[i:i + 100]
        try:
            send_push(chunk, data, idempotency_key=f"{key}-{i // 100}" if key else None)
        except Exception as e:  # noqa: BLE001
            logger.warning("Push non envoyé (non bloquant) : %s", e)
