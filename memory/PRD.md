# UDAMG APP - PRD

## Vision
Mobile-first application for the **UDAMG church community** to structure evangelism fieldwork and coordinate church events, guided by the mission slogan *"Sauvé par Grâce pour Sauver"*.

## Architecture
- **Frontend**: React Native (Expo Router, file-based routing), pure white minimalist UI with royal blue (#0047AB) accents.
- **Backend**: FastAPI + MongoDB. All routes prefixed `/api`.
- **Auth**: JWT (Argon2 hashing). 3 roles: `pasteur`, `ouvrier`, `evangeliste`. Tokens stored in expo-secure-store on native, localStorage on web.

## Data Model (MongoDB)
- `users` — email, nom, prenom, password_hash, role, disabled
- `villes` (Églises) — nom, code_postal, pays, whatsapp_link
- `programmes` — nom, description, code_acces, is_ebed
- `contacts` (âmes actives) — nom (UPPER), prenom, tel, categorie (Mission JAC/GÉDÉON/CCMG), referent (auto), niveau 1-4, notes, date_ajout, context_type, context_id, context_nom, enregistre_par, created_at
- `anciens` — copy of archived contacts + archived_at/by
- `transferts` — log of every inter-church transfer (contact_id, from, to, by, timestamp)
- `evenements` — titre, description, date, lieu, ville, type_evenement, intervenants[], image_url
- `invitations` — evenement_id, user_id, special, status

## Pôle 1 — Évangélisation (complete implementation)
### Navigation flow
Menu Principal → Évangélisation → **Églises de France** OU **Programmes Spéciaux** → Contexte (menu 4 boutons) → Catégories (Gédéon/JAC/CCMG/Toutes) → Liste des Âmes.

### Screens
1. **Évangélisation submenu** — 2 large cards (Églises, Programmes)
2. **Églises de France** — grid + search + "Bilan Global" (pasteur only)
3. **Programmes Spéciaux** — grid + modal de code d'accès (protected). EBED = badge doré.
4. **Menu contextuel** — 4 boutons colorés (Nouveau Contact vert / Liste Âmes bleu / Stats or / Anciens gris)
5. **Vue Catégories** — Gédéon, Mission JAC, CCMG, "Toutes les âmes"
6. **Liste des Âmes** — carte contact riche : nom majuscule + pastille niveau (Rouge/Jaune/Vert/Or) + badge catégorie + tel/référent/date + actions WA/SMS/Relancer/Options
7. **Bottom Sheet Ajout/Modification** — Prénom/Nom, Tel (0612345678), Catégorie (chips), Référent auto-rempli, Niveau (chips colorées), Notes, Fermer/Enregistrer
8. **Modale Options** — Appeler, Modifier, Transférer, Archiver (Passer en Ancien), Supprimer (pasteur only)
9. **Modale Relance 2 étapes** — 1) choix niveau 2) WhatsApp/SMS avec message pré-rempli incluant lien WhatsApp de l'église
10. **Modale Transfert** — sélection église de destination + log automatique dans `transferts`
11. **Tableau de bord** — Total + 4 jauges circulaires (Relancés/Présentés/Invités/Disciples) + Par catégorie + boutons export Excel/PDF (v2, avec bouton lots-de-10 EBED conditionnel)
12. **Liste des Anciens** — pasteur/ouvrier only

### RBAC (strict)
- **Évangéliste** : ne voit QUE ses propres fiches (`enregistre_par == email`), pas de bouton archiver/transférer/anciens/bilan global.
- **Ouvrier** : voit toutes les fiches du contexte + peut archiver/transférer.
- **Pasteur** : ci-dessus + Bilan Global + Supprimer définitivement.

### Business logic
- Nom stocké en MAJUSCULES automatiquement
- `date_ajout` injecté au format DD/MM/YYYY
- `referent` = nom+prénom du user courant, non éditable
- Recherche : normalisation NFD (retire accents) + lowercase
- Message de relance dynamique : `"Bonjour {prenom}... Rejoins notre groupe WhatsApp : {link}"`
- WhatsApp: `wa.me/{tel_33prefixed}?text=...` ; SMS: `sms:{tel}?body=...`
- Archivage : soft-copy vers `anciens` puis delete
- Transfert : update in-place du contact + insert log `transferts`

## Pôle 2 — Événements (v1 déjà livré, inchangé)
- Liste + détail + Inviter les anciens ✨ (pasteur only)

## Exports Excel/PDF
Les 3 boutons sont présents mais renvoient un message "Bientôt disponible" (v2). Nécessite l'intégration d'un service de génération (SheetJS/jsPDF côté client ou service backend).

## Business Enhancement
Le module **Relance en 2 étapes** transforme chaque évangéliste en canal de conversion mesurable : à chaque envoi WhatsApp/SMS, le niveau progresse automatiquement (1→2→3→4). Le tableau de bord montre en temps réel le funnel de conversion, donnant à chaque église un tableau de suivi pastoral inédit.
