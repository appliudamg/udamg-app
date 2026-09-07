const BASE = process.env.EXPO_PUBLIC_BACKEND_URL!;

export type Role = "pasteur" | "ouvrier" | "evangeliste";
export type User = { id: string; email: string; nom: string; prenom: string; role: Role };
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
    const msg = body?.detail || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
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
    case 1: return { bg: "#EF4444", label: "Relancé" };
    case 2: return { bg: "#F59E0B", label: "Présenté" };
    case 3: return { bg: "#10B981", label: "Invité" };
    case 4: return { bg: "#D4A017", label: "Disciple" };
    default: return { bg: "#94A3B8", label: "-" };
  }
};

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const buildRelanceMessage = (prenom: string, egliseNom: string, whatsappLink?: string | null): string => {
  const link = whatsappLink ? `\n\nRejoins notre groupe WhatsApp : ${whatsappLink}` : "";
  return `Bonjour ${prenom}, c'est un plaisir de te retrouver ! Nous serions ravis de te compter parmi nous à ${egliseNom}. Que Dieu te bénisse.${link}`;
};

export const buildWhatsAppUrl = (tel: string, message?: string): string => {
  const clean = tel.replace(/[^0-9+]/g, "").replace(/^0/, "33");
  return `https://wa.me/${clean}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
};

export const buildSmsUrl = (tel: string, message?: string): string => {
  return `sms:${tel}${message ? `?body=${encodeURIComponent(message)}` : ""}`;
};
