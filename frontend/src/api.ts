const BASE = process.env.EXPO_PUBLIC_BACKEND_URL!;

export type Role = "pasteur" | "ouvrier" | "evangeliste" | "membre";
export type User = {
  id: string; email: string; nom: string; prenom: string; role: Role;
  ville_id?: string | null; ville_nom?: string | null;
  is_approved?: boolean; disabled?: boolean;
};
export type AuthResponse = { access_token: string; token_type: string; user: User };

export type Ville = { id: string; nom: string; code_postal: string; pays: string; whatsapp_link?: string | null };
export type Programme = { id: string; nom: string; description?: string | null; code_acces?: string | null; is_ebed: boolean };

export type Categorie = "Mission JAC" | "GÉDÉON" | "CCMG";
export const CATEGORIES: Categorie[] = ["Mission JAC", "GÉDÉON", "CCMG"];

export type Contact = {
  id: string; nom: string; prenom: string; tel?: string | null;
  categorie: Categorie; referent: string; niveau: 1 | 2 | 3 | 4;
  notes?: string | null; date_ajout: string;
  context_type: "ville" | "programme"; context_id: string;
  context_nom?: string | null; enregistre_par: string; created_at: string;
};

export type Evenement = {
  id: string; titre: string; description?: string | null;
  date: string; lieu: string; ville?: string | null;
  type_evenement: string; intervenants: string[];
  image_url?: string | null; created_by: string; created_at: string;
};

export type Invitation = {
  id: string; evenement_id: string; user_id: string;
  special: boolean; status: string; created_at: string;
};

export type Stats = {
  total_contacts: number; total_evenements: number;
  total_villes: number; total_programmes: number;
  my_contacts: number; anciens: number;
};

export type ContactStats = {
  total: number;
  niveau_1_relances: number;
  niveau_2_presentes: number;
  niveau_3_invites: number;
  niveau_4_disciples: number;
  by_categorie: Record<string, number>;
};

// Pôle 3 — Médias & Enseignements
export type MediaKind = "audio" | "video" | "podcast" | "livre";
export type MediaCategory = string;

export type MediaItem = {
  id: string;
  title: string;
  author: string;
  category: MediaCategory;
  kind: MediaKind;
  audio_path?: string | null;
  cover_path?: string | null;
  duration?: number | null;
  description?: string | null;
  transcript?: string | null;
  created_at: string;
  created_by?: string | null;
};

export type Playlist = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  item_ids: string[];
  updated_at: string;
};

export type MediaProgress = {
  media_id: string;
  last_position_seconds: number;
  completed: boolean;
  updated_at: string;
};

export const mediaFileUrl = (id: string, token: string): string =>
  `${BASE}/api/media/${id}/file?token=${encodeURIComponent(token)}`;

export const mediaCoverUrl = (id: string): string =>
  `${BASE}/api/media/${id}/cover`;

export const fmtDuration = (secs?: number | null): string => {
  if (!secs || secs < 1) return "--:--";
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  const m = Math.floor((secs / 60) % 60);
  const h = Math.floor(secs / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s}`;
  return `${m}:${s}`;
};

export class ApiError extends Error {
  status: number;
  detail: any;
  code?: string;
  constructor(status: number, detail: any) {
    const msg = typeof detail === "string" ? detail : (detail?.message || detail?.code || JSON.stringify(detail));
    super(msg);
    this.status = status;
    this.detail = detail;
    this.code = typeof detail === "object" ? detail?.code : undefined;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, body?.detail ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const eventTypeLabel = (t: string): string => {
  switch (t) {
    case "sortie_evangelisation": return "Sortie d'évangélisation";
    case "veillee": return "Veillée";
    case "culte_special": return "Culte spécial";
    case "reunion_jeunes": return "Réunion des jeunes";
    case "reunion_anciens": return "Réunion des anciens";
    default: return t;
  }
};

export const roleLabel = (r: Role): string => {
  switch (r) {
    case "pasteur": return "Pasteur";
    case "ouvrier": return "Ouvrier";
    case "evangeliste": return "Évangéliste";
  }
};

export const niveauColor = (n: number): { bg: string; label: string } => {
  switch (n) {
    case 1: return { bg: "#EF4444", label: "Prise de contact" };
    case 2: return { bg: "#F59E0B", label: "Présentation Église" };
    case 3: return { bg: "#10B981", label: "Invitation Culte" };
    case 4: return { bg: "#D4A017", label: "Invitation Dernière Minute" };
    default: return { bg: "#94A3B8", label: "-" };
  }
};

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const MSG_N1 = (prenom: string, referent: string) =>
`Bonjour ${prenom} 🙏
Vous avez été approché(e) par ${referent} qui fait partie de notre équipe d'évangélisation, et nous rendons grâce à Dieu pour cette rencontre, convaincus qu'elle n'est point le fruit du hasard, mais l'expression de Son amour pour vous.
Pour nous connaître un peu plus et afin d'être régulièrement édifié(e), nous vous invitons à nous rejoindre sur nos différents canaux :
👉 WhatsApp : https://whatsapp.com/channel/0029Vb70A780rGiN3kXVCU13
👉 Facebook : https://www.facebook.com/ccmgangersfrance
👉 Instagram : https://www.instagram.com/ccmg.angers
👉 TikTok : https://www.tiktok.com/@ccmg_angers
Que la grâce, la paix et l'amour de notre Seigneur Jésus-Christ reposent abondamment sur vous. Soyez richement béni(e) ✨
Équipe d'évangélisation du CCMG ANGERS`;

const MSG_N2 = (prenom: string) =>
`Bonsoir ${prenom} 🙏
C'est avec joie que nous revenons vers vous — l'équipe d'évangélisation de l'église CCMG Angers. Nous espérons que vous allez bien, par la grâce de Dieu.
Nous souhaitons vous encourager à garder en mémoire que le Seigneur vous aime profondément et qu'Il a pour votre vie des desseins de paix, d'espérance et de gloire.
📅 Nos programmes de la semaine :
🔵 Tous les mercredis (19h - 21h) : Enseignement biblique suivi de questions/réponses.
🔵 Tous les dimanches (10h - 12h30) : Culte de célébration.
Nous nous préparons à vous recevoir et espérons de tout cœur que vous serez présent à l'un de nos programmes !
📍 Coordonnées et Accès : Adresse : 3 rue Carl Linné, 49000 Angers
Pour nous rejoindre, voici les différents moyens de transport :
Station Tram Ligne A ou C : Direction Roseraie, descendre au terminus Roseraie (compter environ 10 min de marche).
Bus Ligne 3 : Direction Mûrs-Erigné, descendre à l'arrêt Allard (environ 5 min de marche vers l'église).
Bus Ligne 5a ou 5b : Direction Aquavita, descendre à l'arrêt Cevert (l'église se trouve juste à côté).
Si vous avez des questions, n'hésitez pas à me contacter ou à joindre le secrétariat de l'église au 06 35 38 07 58.
Que Dieu vous bénisse ! L'équipe d'évangélisation du CCMG Angers`;

const MSG_N3 = (prenom: string, nomEglise: string) =>
`Bonjour ${prenom} 🙏
👉 Que diriez-vous, cette fois-ci, de venir nous rencontrer à l'église ${nomEglise} ce dimanche ?
Nous aimerions vous inviter chaleureusement à venir célébrer Dieu avec nous ce dimanche à partir de 10h 🙌
« Je suis dans la joie quand on me dit : Allons à la maison de l'Éternel ! » (Psaume 122:1) ✨
Ce sera un moment de paix, de joie et de bénédiction dans la présence de Dieu. Votre présence sera une grande joie pour nous !
Au plaisir de vous y voir 😊 Que Dieu vous bénisse 🙏`;

const MSG_N4 = (prenom: string, nomEglise: string) =>
`Bonjour ${prenom} 🙏
Un dernier rappel bienveillant : nous vous attendons ce dimanche à l'église ${nomEglise} à partir de 10h.
Votre présence serait une immense bénédiction. Au plaisir de vous accueillir !
Que Dieu vous bénisse 🙏`;

export const buildRelanceMessage = (
  prenom: string,
  egliseNom: string,
  _whatsappLink?: string | null,
  niveau: number = 1,
  referent: string = "notre équipe",
): string => {
  switch (niveau) {
    case 1: return MSG_N1(prenom, referent);
    case 2: return MSG_N2(prenom);
    case 3: return MSG_N3(prenom, egliseNom || "CCMG");
    case 4: return MSG_N4(prenom, egliseNom || "CCMG");
    default: return MSG_N1(prenom, referent);
  }
};

export const buildWhatsAppUrl = (tel: string, message?: string): string => {
  const clean = tel.replace(/[^0-9+]/g, "").replace(/^0/, "33");
  return `https://wa.me/${clean}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
};

export const buildSmsUrl = (tel: string, message?: string): string => {
  return `sms:${tel}${message ? `?body=${encodeURIComponent(message)}` : ""}`;
};
