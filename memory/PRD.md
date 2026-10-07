# UDAMG APP - PRD

> **Itération 15 (juin 2026) — MIGRATION COMPLÈTE sur les comptes du client + nouvelle arborescence.**
> Les sections plus bas décrivant l'Évangélisation / MongoDB / Google Auth sont HISTORIQUES (code archivé dans la branche git `legacy-mongo`).

## Infrastructure (100 % comptes client)
- **Supabase** (projet `olehhoovstiheycdarhs`, région eu-west-1) : Postgres (tables + RLS, schéma `supabase/migrations/001_init.sql`) + Storage (bucket privé `media`, bucket public `covers`). Backend FastAPI utilise `supabase-py` avec la clé service (client thread-local).
- **Vercel** : projet `udamg-app` (team appliudamg) → https://udamg-app.vercel.app — web Expo exporté (`frontend/dist`) + fonction Python `api/index.py` (FastAPI). Env vars définies sur Vercel. Déploiement : `cd frontend && EXPO_PUBLIC_BACKEND_URL="" npx expo export -p web && cd .. && npx vercel deploy --prod`.
- **GitHub** : `appliudamg/udamg-app` — branches `main` (Supabase) et `legacy-mongo` (archive) poussées. Les fichiers `.env` sont ignorés (push protection GitHub) ; modèle : `backend/.env.example`.
- **Stripe / Brevo** : clés stockées dans `backend/.env` + Vercel env (aucune fonctionnalité demandée encore).
- Plus AUCUNE dépendance MongoDB / Emergent Object Storage / Emergent Google Auth.

## Arborescence actuelle
- **Intro vidéo** au lancement (`app/index.tsx`, `assets/video/intro.mp4`, bouton Passer, sécurité 12 s).
- **Espace Événements** : 1.1 Événements (portail complet : inscrits/badges EBED, scanner QR, séances, enfants, tableau Pasteur, exports CSV/PDF) · 1.2 **Messagerie** (diffusion unidirectionnelle ADMIN/ÉQUIPE TECHNIQUE → tous, badge non-lus sur le menu, suivi de lecture « En direct » avec listes Vu / Pas encore vu, polling 4 s).
- **Media (audios/vidéos)** : Culte du dimanche · Programmes (UDAMG/CAMP/Autre) · Programmes spéciaux (Convention/Nuit de la bonne nouvelle/Autre) · Enseignements · Réunions (Réunion Pasteur/Conseil élargi) · Podcasts · Story. Upload = URL signée Supabase (PUT direct depuis le client, web + natif) puis `/confirm`. Lecture = `/api/media/{id}/file` → 307 vers URL signée (Range OK).
- **Équipe & Utilisateurs** (admin) · **Profil** (droits, changement de mot de passe).

## Rôles & droits (backend/core.py ↔ frontend/src/roles.ts)
| Rôle | Media lecture | Media écriture | Messagerie envoi | Événements | Utilisateurs |
|---|---|---|---|---|---|
| admin | tout | ✗ | ✓ | gestion + admin | ✓ |
| equipe_technique | tout | ✓ (seul) | ✓ | gestion | ✗ |
| pasteur / missionnaire / berger | tout | ✗ | ✗ | gestion (pasteur = admin) | ✗ |
| leader / ouvrier / disciple / membre | tout sauf Réunion Pasteur & Conseil élargi | ✗ | ✗ | consultation, pointage | ✗ |

## Emails & notifications
- **Brevo** (`backend/mailer.py`) : email d'accès automatique à la création d'un compte / réinitialisation du mot de passe (expéditeur appli.udamg@gmail.com, validé). Boutons App Store / Google Play activables via env `APP_STORE_URL` / `PLAY_STORE_URL` ; `EMAIL_SHOW_WEB_LINK=false` masque le lien web.
- **Push** (`backend/push.py`, relais Emergent) : chaque message de la Messagerie déclenche une notification à tous les utilisateurs (lots de 100, non bloquant). Frontend : `src/push.ts` (enregistrement à chaque session), handlers dans `app/_layout.tsx`. `google-services.json` fourni (Firebase `udamg-app`, package `com.udamg.app`). `EMERGENT_PUSH_KEY=placeholder` (remplacé au déploiement Emergent). Ne fonctionne que dans un build natif (pas Expo Go / web).

## Itération 17 (juin 2026)
- Mot de passe affichable/masquable partout (`src/PasswordInput.tsx`).
- Media : section « Ajouté récemment » ; **Pensée du jour** (`backend/pensees.py`, écran `media/pensees`, chip dans Découvrir) — création/suppression admin + équipe technique, jamais supprimée automatiquement, image optionnelle (bucket covers/pensees).
- Événements : détail « Voir plus » (affiche, description, lieu, date, durée, horaires) + actions par rôle : Je m'inscris (tous), Copier le lien (tous sauf membre), Rappel → Messagerie + push (admin/tech), Émargement & gestion (admin/tech/pasteur), Supprimer (admin/tech/pasteur). Émargement (séances, pointage, enfants, ajout inscrits) refusé aux membre/disciple/ouvrier/leader/berger/missionnaire côté API. Fix boucle du bouton Retour.
- Icônes Lucide partout (plus d'émojis) ; streaming direct via `stream_url` signée + faststart MP4 ; Stories (équipe technique).
- En attente : logo officiel (fichier PNG) pour remplacer le texte « UDAMG APP » sur le menu.

## Itération 18 (juin 2026)
- Profil : « Mes droits d'accès » visible uniquement admin / équipe technique (`canViewAccessRights`).
- Menu : bloc « Je donne » → https://linktr.ee/offrandesccmgi (`src/links.ts`) ; même bouton dans le lecteur (à côté de « Sommeil ») et sous la vidéo.
- Lecteur global : `PlayerProvider` + `MiniPlayer` + `PlayerModal` dans `app/(app)/_layout.tsx` → la lecture continue hors du bloc Media. Arrière-plan : `shouldPlayInBackground`, `interruptionMode: doNotMix`, `setActiveForLockScreen` (contrôles écran verrouillé), app.json : `UIBackgroundModes [audio, remote-notification]`, plugin expo-audio `enableBackgroundPlayback`, expo-video `supportsBackgroundPlayback`. **Build natif requis** (pas Expo Go / web).
- Push : `enableBackgroundRemoteNotifications` (expo-notifications). Build natif requis.
- Événements / inscriptions (`backend/events.py`, écran `app/(app)/evenements/[id]/inscrire.tsx` modes self/other/edit) :
  - `POST /api/event/participants/me` (Je m'inscris, lié au compte : `user_id`) → badge déposé en **message privé** dans la Messagerie (`messages.recipient_id`, `action_url` → `/badge?event=&b=`) + **email Brevo** avec QR PNG en pièce jointe (`mailer.send_badge_email`).
  - `GET /me`, `PATCH /me/{pid}`, `DELETE /me/{pid}` (Annuler → bouton « Je m'inscris » réapparaît).
  - `POST /api/event/participants/other` (tous rôles, email bénéficiaire obligatoire) → badge par email ; `registered_by`.
  - Détail événement : section « Inscription » dynamique (Je m'inscris | Voir mon badge / Modifier + Annuler mon inscription) + « Inscrire une autre personne ».
  - `badge_id` = max(numéro existant)+1 (plus de collision après annulation).
- Messagerie : `GET /messages` = diffusion + mes messages privés ; `/messages/{id}` 404 pour un autre utilisateur ; bouton « Voir mon badge » dans le détail (`action_url`).
- Espace Pasteur : code PIN **0123** demandé à chaque ouverture (`src/event/PinLock.tsx`) ; toutes les séances supprimées (migration `002_badges_private_messages.sql`), liste vide, création manuelle uniquement.
- Tests : `backend/tests/test_iter18_participants_me.py` 21/21, `test_reports/iteration_18.json`.

## Comptes : voir `memory/test_credentials.md`
## Reste à faire
- Supabase plan Pro actif, limite d'upload relevée ; les 3 médias historiques sont complets.
- Vérifier la vidéo d'intro sur appareil réel (H.264 non supporté par le Chromium headless de test).

---


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


## Pôle 3 — Médias & Enseignements
Streaming premium (thème sombre or/rouge/violet) inspiré de DS Audio + ImpactX.

### Écrans
- `/(app)/media` — Accueil : bannières, "Continuer l'écoute", raccourcis, sections par catégorie
- `/(app)/media/discover` — recherche + filtres kind (audio/vidéo/podcast/livre) + catégories
- `/(app)/media/library` — Playlists (CRUD) + Favoris
- `/(app)/media/playlist/[id]` — Détail playlist, playAll, add/remove
- `/(app)/media/admin` — Console upload (pasteur + ouvrier) : titre, orateur, catégorie, type, description, transcription, audio, pochette
- **PlayerModal** plein écran : pochette / script, ±10 s, prev/next, vitesse (0.75/1/1.25/1.5/2×), sleep timer (15/30/60 min ou fin du morceau), toggle favoris
- **MiniPlayer** flottant : progress bar or, toggle, tap = ouvrir le player, remonte au-dessus du bottom nav

### Backend (routes `/api/media*` + `/api/playlists*`)
- CRUD médias (POST/PATCH pasteur+ouvrier, DELETE pasteur)
- Stream `/api/media/{id}/file` (Bearer + `?token=` pour le web)
- Cover `/api/media/{id}/cover`
- Favoris (add/del/list)
- Playlists (CRUD + add/remove item)
- Progress (save + list + "continue listening")
- 8 médias seedés (pochette placeholder + description ; pas d'audio jusqu'à upload admin)

### Modèle Firestore-like (MongoDB)
- `media_items` — id, title, author, category, kind, audio_path, cover_path, duration, description, transcript, created_at, created_by
- `playlists` — user_id, title, item_ids[], updated_at
- `favorites` — (user_id, media_id) unique
- `user_progress` — (user_id, media_id) unique + last_position_seconds, completed

### Stockage
Emergent Managed Object Storage — path convention `udamg/media/{id}/audio.{ext}` + `cover.{ext}`.
La lecture en arrière-plan / verrouillage écran est activée (audio mode) mais nécessite un **build natif** pour tests réels (pas Expo Go).


## Itération 19 (juin 2026)
- **Doublons bloquants (409)** : participants (même événement : nom+prénom sans accents/casse, email, téléphone normalisé) sur tous les points d'inscription ; utilisateurs (email ou nom+prénom) à la création Admin. Message explicite « Doublon détecté … refusé(e) ».
- **Rôles** : Admin = droits totaux (écriture média incluse : `MEDIA_WRITE_ROLES = {admin, equipe_technique}`) ; nouveau rôle **COMEV** (`comev`, migration `003_role_comev.sql`) → `EVENT_MANAGE_ROLES` (émargement & gestion, séances, inscrits ; Espace Pasteur toujours protégé par PIN 0123 ; pas d'accès utilisateurs). Bloc COMEV dans Équipe & Utilisateurs (entre Pasteur et Admin).
- **Accueil** : « Je donne » en grand bloc image (comme Événements / Media).
- **Mini-lecteur** : croix `mini-player-close` → `player.stop()` (arrêt + fermeture).
- **Messages automatiques** (`messaging.broadcast_system_message`, + push) : nouveau média (1er fichier audio/vidéo confirmé → `/(app)/media?open=<id>` lit directement), story (`/(app)/media/stories`), pensée (`/(app)/media/pensees?open=<id>`), création d'événement (`/(app)/evenements/<id>`), annulation (`/(app)/evenements`). Détail message : bouton « Aller à » contextuel (`action_url`). Aucun message pour les changements de rôle.
- **Thème** : `ThemeProvider` (`src/theme.ts`, préférence `udamg.theme` en AsyncStorage : light / dark / system) ; palette `dark` ; tous les écrans convertis en `makeStyles((colors) => …)` + `useTheme()` (script `frontend/scripts/themify.py`). Sélecteur Profil → Apparence (Clair / Sombre / Adaptatif). Le bloc Media garde son thème sombre dédié (`mediaTheme`).
- **Découvrir** : blocs Tout · Enseignements & Audio · Louange & Adoration (nouvelle catégorie média `louange`), filtres Audio / Vidéo ; pour Louange la liste s'affiche directement (pas de sous-catégories).
- **Événements** : écran `app/(app)/evenements/form.tsx` (création + modification `?id=`) avec import d'affiche (`POST /api/evenements/image-upload-url` → bucket public `covers/events/`) ; bouton « Modifier l'événement » (admin/tech/pasteur/comev). Modal de création supprimée de la liste.
- **Retour** : `ChevronLeft` lucide visible (cercle bordé bleu) sur toutes les pages.
- Tests : `backend/tests/test_iter19_duplicates_comev.py` 20/20 ; frontend validé (iteration_19).

## Itération 20 (juin 2026) — Audit sécurité (Red Team) & correctifs
Audit `security_audit_agent` : 2 Élevées, 3 Moyennes, 7 durcissements → tous corrigés (`backend/tests/test_iter20_security.py` 6/6).
- SEC-001 : `/event/participants/by-badge/{id}` exige un jeton HMAC `t` (`events.badge_token`, dérivé de `JWT_SECRET`) et ne renvoie plus email/tel/notes ; `badge_token` ajouté aux réponses participants ; liens badge (email, Messagerie, écrans) incluent `&t=`. Le scanner utilise `_find_by_badge` (interne).
- SEC-002 : `/users`, `/event/participants` (liste + détail), `/event/dashboard`, `/event/pointages`, `/event/sessions`, `/event/enfants` (GET), exports CSV/PDF → `EVENT_MANAGE_ROLES` uniquement.
- SEC-003 : `/api/register-push` authentifié, `user_id` forcé depuis le jeton (`src/push.ts` envoie le Bearer).
- SEC-004 : « Inscrire une autre personne » limité à 10 / heure / utilisateur (compté en base) + log.
- SEC-005 : export CSV neutralise `= + - @ \t \r`.
- Durcissements : CORS restreint (`ALLOWED_ORIGINS` env + regex vercel/emergent), anti brute-force login (5 échecs / 5 min par compte, 60 / IP, `core.check_failures`), inscription publique 10 / 10 min / IP, mot de passe ≥ 10 car. + lettre + chiffre (`check_password_strength`, création/modif/changement ; les anciens restent valides), URLs signées média TTL 1 h, logs httpx en WARNING, deeplinks/action_url : seules les routes internes et https vers udamg-app.vercel.app / linktr.ee sont ouverts.
- Risques acceptés : PIN 0123 côté client (cosmétique, données protégées côté serveur) ; `?token=` conservé pour le streaming web (nécessaire aux balises audio/vidéo) ; `google-services.json` versionné (identifiants client Firebase non secrets) ; rate limiting en mémoire par instance (Vercel serverless).
- Correctif thème (iter 20b) : bloc Media suit désormais le thème (palette `mediaLight` / `mediaDark`, `useMediaTheme()` + `makeMediaStyles`, script `frontend/scripts/themify_media.py`) ; chips de section Découvrir : hauteur 40 fixe (texte plus coupé). Visionneuse stories reste noire volontairement.
