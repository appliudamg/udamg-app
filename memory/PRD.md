# UDAMG APP - PRD

## Vision
Application mobile complète pour la communauté UDAMG — évangélisation + gestion d'événements avec pointage.

## Stack
- **Frontend**: React Native / Expo Router / TanStack Query / `expo-camera` (QR scan) / `react-native-qrcode-svg` (badge) / `@gorhom/bottom-sheet` / `expo-file-system` + `expo-sharing`
- **Backend**: FastAPI + MongoDB (Argon2 + JWT), Emergent-managed Google OAuth, `openpyxl` (Excel), `reportlab` (PDF)
- **Design**: pure white + royal blue (#0047AB)

## Rôles (RBAC)
- **pasteur** — voit tout, supprime, exporte, journaux, purge
- **ouvrier** — voit toute église/événement, archive/transfère, contrôle des séances
- **evangeliste** — ne voit QUE ses propres fiches (évangélisation), inscrits publics OK

## Pôle 1 — Évangélisation (déjà livré, INCHANGÉ dans cette itération)
Menu → Évangélisation → Églises/Programmes/Rappels/Journal transferts → Contexte → Liste des Âmes → Stats (Excel/PDF exports).

## Pôle 2 — Événements & Émargement (livré dans cette itération)

### Portail multi-programmes
`Menu → Événements` = liste des programmes avec badge d'ajout `+` (pasteur/ouvrier). Modal de création (titre, lieu, ville, date ISO, type).

### Hub d'accueil par événement
Bannière de séance active/inactive + 3 KPI (Inscrits/Pointés/Enfants) + 5 actions :
- 📷 Scanner de pointage
- 👥 Gestion des inscrits
- 🧒 Comptage enfants
- ⛪ Espace Pasteur (rôle pastoral)
- 📝 Inscription publique (deep link vers `/inscription?event=…`)

### Scanner (`(app)/event/[id]/scanner`)
- `expo-camera` avec `barcodeScannerSettings.barcodeTypes: ["qr", "code128", "code39"]`
- Verrouillage **strict** si aucune séance active (backend 423 + banner)
- Facing switch (avant/arrière), Pause/Reprise, saisie manuelle EBED-XXXX
- Overlay résultat coloré (vert=OK, orange=déjà pointé, rouge=erreur)
- Historique défilant des 10 derniers scans + toasts
- Cooldown 1.5s anti-doublon lecture

### Inscrits (`(app)/event/[id]/inscrits`)
- Toolbar : Export CSV, Purge Inconnus/Tout (avec confirmation manuscrite `SUPPRIMER`)
- Onglets scrollables : Tous / Membre / Inconnu / Prospect Évangélisé / Prospect Famille / Externe
- Recherche accents-insensible (nom, badge, tel, église)
- Cartes avec badge coloré profil, pastilles SMS/WhatsApp
- Bouton "Voir badge" → écran badge public
- Bottom Sheet CRUD (Prénom, Nom, Profil chips, Tel, Email, Église chips depuis /villes, Notes)
- Long-press = supprimer (pasteur)
- Auto-attribution `EBED-XXXX` séquentielle par événement

### Comptage enfants (`(app)/event/[id]/enfants`)
- Compteur géant temps réel (auto-refresh 3s)
- Bouton `+1` XL, boutons `+N` multiple et `-1`
- Verrouillé si aucune séance active

### Espace Pasteur (`(app)/event/[id]/pasteur`)
- 6 KPI (Total, Pointés, Enfants, Membres, Inconnus, Prospects)
- Contrôle des séances : Lancer (auto-arrêt de la précédente) / Arrêter / Purger pointages (SUPPRIMER)
- Rapport bilan PDF (téléchargement immédiat)
- Historique des séances + arrivées récentes en temps réel (refetch 4s)

### Inscription publique (`/inscription?event=…`)
- Écran **sans authentification** partageable
- Sélecteur de profil visuel 5 cartes + guide contextuel
- Champs dynamiques : email/tel/église/référent selon profil
- Confirmation avec badge attribué + CTA "Voir mon badge"

### Badge public (`/badge?event=…&b=EBED-XXXX`)
- Carte-pass 320×470 fond blanc + cadre doré `#D4A017`
- QR Code SVG scannable (`react-native-qrcode-svg`)
- Nom/Prénom, profil coloré, ID badge, église
- Bandeau bas "Sauvé par Grâce pour Sauver"

### Système de Toasts
`ToastProvider` global — 3 variantes (success/error/info), auto-dismiss 3.2s, coin bas droite.

## Modèle de données (Événements)
- `evenements` — titre, description, date, lieu, ville, type_evenement, intervenants, image_url
- `event_participants` — evenement_id, **badge_id (EBED-XXXX unique par évt)**, nom (UPPER), prenom, profil, tel, email, eglise, jours_presence[], referent, notes, sms_status, wa_status
- `event_sessions` — evenement_id, nom, active, started_at, ended_at
- `event_pointages` — evenement_id, participant_id, session_id, scanned_by, timestamp (unique par (participant, session))
- `event_enfants` — evenement_id, session_id, delta, by, timestamp

## Endpoints (12 nouveaux)
GET/POST/PATCH/DELETE `/api/event/participants` · POST `/api/event/participants/public` · GET `/api/event/participants/by-badge/{id}` · POST `/api/event/participants/purge` · GET/POST `/api/event/sessions[/start|/:id/stop|/purge-pointages]` · POST `/api/event/pointages` · GET `/api/event/pointages` · GET/POST `/api/event/enfants` · GET `/api/event/dashboard` · GET `/api/event/exports/participants.csv|bilan.pdf`

## Comptes de démo
`admin@udamg.app` / `AdminUdamg2026!` (Pasteur) · `ouvrier@udamg.app` / `OuvrierUdamg2026!` · `evangeliste@udamg.app` / `EvangUdamg2026!`

Codes programmes évangélisation : `EBED2026`, `RETRAITE`. Google Login via Emergent OAuth disponible sur `/login`.

## Raffinements Pôle 1 (message 287 — validés iter 9-10)
- 15 églises CCMG officielles seedées (Angers → Vannes-Redon) + création/suppression réservées au pasteur.
- Champ « Référent » éditable dans le formulaire de contact ; POST/PATCH `/contacts` envoient `referent` (fallback : `{prenom} {nom}` de l'utilisateur si vide).
- 4 modèles Relance (N1-N4) précis dans `src/api.ts::buildRelanceMessage` avec `{prenom}`, `{referent}`, `{nom_eglise}`.
- Programmes sans obligation de code d'accès + suppression pasteur.
- Suppression physique (hard delete) pour Anciens (204).
- Stats hebdomadaires (`by_week` sur 8 dernières semaines ISO) + exports Excel/PDF corrigés (magic bytes validés).

