# UDAMG APP - PRD

## Vision
Mobile-first app for the **UDAMG church community** — evangelism fieldwork + church events. Slogan *"Sauvé par Grâce pour Sauver"*.

## Stack
- **Frontend**: React Native / Expo Router / TanStack Query / expo-web-browser + expo-linking (Google Auth) / expo-file-system + expo-sharing (exports).
- **Backend**: FastAPI + MongoDB. Argon2 password hashing + our own JWT. Emergent-managed Google OAuth via `/api/auth/session`. Excel via `openpyxl`, PDF via `reportlab`.
- **Design**: pure white + royal blue (#0047AB).

## Roles
- **pasteur** — voit tout, supprime, exporte, journal complet
- **ouvrier** — voit toute église du contexte, archive/transfère, journal de ses actions
- **evangeliste** — ne voit QUE ses propres fiches, ses propres rappels, ses propres transferts

## Data Model (MongoDB)
`users` (email, nom, prenom, password_hash, role, google_id, picture, disabled) · `villes` · `programmes` · `contacts` · `anciens` · `transferts` · `evenements` · `invitations`

## Pôle 1 — Évangélisation (complete)
Menu → Évangélisation → Églises OU Programmes OU **Rappels** OU **Journal transferts**.

Contextes → menu 4 boutons → Catégories → Liste des Âmes.

### Screens
Login (email/password **+ Google**) · Register · Menu Principal · Évangélisation submenu (2 grandes cartes + 2 outils) · Églises (grid + Bilan Global) · Programmes (avec modal code) · Menu contextuel · Vue Catégories · Liste des Âmes (recherche accents-insensible, cartes avec WA/SMS/Relance/Options) · Bottom Sheet Ajout/Modif · Modales Options/Relance/Transfert · **Stats (téléchargements Excel/PDF réels)** · Anciens · **Rappels automatiques** (filtres 3/7/14/30 j) · **Journal des transferts** (recherche) · Profile · Événements (liste, détail, invitation anciens ✨).

### Nouveautés livrées dans cette itération
1. **Google Login (Emergent-managed)** — bouton `Continuer avec Google` sur login. Le flow gère mobile (`WebBrowser.openAuthSessionAsync` + fallback deep link + `getInitialURL`) et web (`window.location.href` + parsing hash/query au montage). Backend échange le `session_id` avec `demobackend.emergentagent.com/auth/v1/env/oauth/session-data` et upsert l'utilisateur en émettant notre propre JWT.
2. **Exports réels Excel + PDF** — endpoints `/api/exports/contacts.xlsx`, `/contacts.pdf`, `/contacts-lots.pdf`.
   - Excel : onglet Résumé + onglet par catégorie + bilan par église en mode GLOBAL.
   - PDF standard : table complète triée alphabétiquement.
   - PDF EBED : chunking 10 par page, colonne Niveau masquée.
   - Frontend : `expo-file-system` télécharge le fichier avec Bearer, puis `expo-sharing` ouvre la feuille système de partage/enregistrement. Sur web : blob download automatique.
3. **Journal des transferts** — endpoint `/api/transferts` avec recherche full-text (contact, église, responsable) et RBAC (pasteur/ouvrier voient tout, évangéliste voit ses propres actions). Écran dédié avec cartes de-vers.
4. **Rappels automatiques** — endpoint `/api/rappels?days=N` : contacts encore au niveau 1 après `days` jours. Écran avec chips 3/7/14/30 j, empty state 🎉, actions WhatsApp/SMS pré-remplies. RBAC respecté (évangéliste ne voit que les siens).

## Pôle 2 — Événements (v1)
Liste + détail + Inviter les anciens ✨ (pasteur only).

## Business Enhancement
Le triptyque **Rappels + Exports + Journal** convertit l'app UDAMG d'un simple carnet en un **tableau de bord pastoral mesurable**. Les pasteurs peuvent d'un clic exporter le rapport Excel de leur église pour un board meeting, et les évangélistes reçoivent une "to-do list" hebdomadaire des âmes stagnantes.
