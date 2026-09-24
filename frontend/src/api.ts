import { Platform } from "react-native";

// Sur le web déployé (Vercel), l'API est servie sur la même origine (/api).
const ENV_BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const BASE: string = ENV_BASE && ENV_BASE.length > 0
  ? ENV_BASE.replace(/\/$/, "")
  : (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "");

export const API_BASE = BASE;

export type Role =
  | "admin" | "equipe_technique" | "pasteur" | "missionnaire" | "berger"
  | "leader" | "ouvrier" | "disciple" | "membre";

export type User = {
  id: string; email: string; nom: string; prenom: string; role: Role;
  is_approved?: boolean; disabled?: boolean; created_at?: string | null;
};
export type AuthResponse = { access_token: string; token_type: string; user: User };

export type Ville = { id: string; nom: string };

export type Evenement = {
  id: string; titre: string; description?: string | null;
  date: string; lieu: string; ville?: string | null;
  type_evenement: string; intervenants: string[];
  image_url?: string | null; created_by?: string | null; created_at: string;
};

export type Invitation = {
  id: string; evenement_id: string; user_id: string;
  special: boolean; status: string; created_at: string;
};

// ---- Media
export type MediaKind = "audio" | "video";
export type MediaCategoryDef = { key: string; label: string; subcategories: string[] };
export type MediaCategoriesResponse = { categories: MediaCategoryDef[]; kinds: MediaKind[]; can_write: boolean };

export type MediaItem = {
  id: string;
  title: string;
  author: string;
  category: string;
  category_label: string;
  subcategory?: string | null;
  kind: MediaKind;
  audio_path?: string | null;
  cover_path?: string | null;
  cover_url?: string | null;
  duration?: number | null;
  description?: string | null;
  transcript?: string | null;
  created_at: string;
  created_by?: string | null;
  stream_url?: string | null;
};

export type Playlist = {
  id: string; user_id: string; title: string; description?: string | null;
  item_ids: string[]; updated_at: string;
};

export type MediaProgress = {
  media_id: string; last_position_seconds: number; completed: boolean; updated_at: string;
};

// ---- Stories
export type Story = {
  id: string; kind: "image" | "video"; media_path?: string | null; url?: string | null;
  caption?: string | null; created_by?: string | null; author_name: string;
  created_at: string; expires_at: string; viewed: boolean; views_count: number;
};

// ---- Messagerie
export type Message = {
  id: string; sender_id?: string | null; sender_name: string;
  title: string; body: string; created_at: string;
  read: boolean; read_at?: string | null;
  read_count: number; recipients_count: number;
};
export type ReadEntry = { user_id: string; nom: string; prenom: string; email: string; role: Role; read_at?: string | null };
export type MessageReads = { read: ReadEntry[]; unread: ReadEntry[]; read_count: number; recipients_count: number };

export const mediaFileUrl = (id: string, token: string): string =>
  `${BASE}/api/media/${id}/file?token=${encodeURIComponent(token)}`;

export const mediaCoverUrl = (item: Pick<MediaItem, "id" | "cover_url">): string | null =>
  item.cover_url ?? null;

export const fmtDuration = (secs?: number | null): string => {
  if (!secs || secs < 1) return "--:--";
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  const m = Math.floor((secs / 60) % 60);
  const h = Math.floor(secs / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s}`;
  return `${m}:${s}`;
};

export const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { detail: text }; }
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
    case "convention": return "Convention";
    default: return t;
  }
};

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "equipe_technique", label: "Équipe technique" },
  { value: "pasteur", label: "Pasteur" },
  { value: "missionnaire", label: "Missionnaire" },
  { value: "berger", label: "Berger" },
  { value: "leader", label: "Leader" },
  { value: "ouvrier", label: "Ouvrier" },
  { value: "disciple", label: "Disciple" },
  { value: "membre", label: "Membre" },
];

export const roleLabel = (r: Role): string => ROLES.find((x) => x.value === r)?.label ?? r;

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
