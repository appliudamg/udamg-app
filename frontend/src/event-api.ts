// Event portal types & helpers
export const EVENT_PROFILS = ["Membre", "Inconnu", "Prospect Évangélisé", "Prospect Famille", "Externe"] as const;
export type EventProfil = (typeof EVENT_PROFILS)[number];

export const CATEGORIES_AGE = ["Enfant (-13)", "Gédéon (-18)", "J-30 (18-30)", "CCMG (+30)"] as const;
export type CategorieAge = (typeof CATEGORIES_AGE)[number];

export type EventParticipant = {
  id: string;
  evenement_id: string;
  badge_id: string;
  nom: string;
  prenom: string;
  profil: EventProfil;
  categorie_age?: CategorieAge | null;
  tel?: string | null;
  email?: string | null;
  eglise?: string | null;
  jours_presence: string[];
  referent?: string | null;
  notes?: string | null;
  sms_status: "none" | "pending" | "sent";
  wa_status: "none" | "pending" | "sent";
  created_at: string;
};

export type EventSession = {
  id: string;
  evenement_id: string;
  nom: string;
  active: boolean;
  started_at: string;
  ended_at?: string | null;
};

export type PointageRecord = {
  id: string;
  timestamp: string;
  session_id: string;
  scanned_by: string;
  participant: EventParticipant | null;
};

export type EventDashboard = {
  total: number;
  by_profil: Record<string, number>;
  by_age: Record<string, number>;
  by_eglise: Record<string, number>;
  active_session: EventSession | null;
  pointages_active_session: number;
  enfants_active_session: number;
  presence: {
    total: number;
    membres: number; vip: number; prospects: number; externes: number; inconnus: number;
    gedeon: number; j30: number; ccmg: number; enfants_pointes: number;
    by_eglise: Record<string, number>;
  };
};

export const profilColor = (p: string): string => {
  switch (p) {
    case "Membre": return "#0047AB";
    case "Inconnu": return "#F59E0B";
    case "Prospect Évangélisé": return "#10B981";
    case "Prospect Famille": return "#8B5CF6";
    case "Externe": return "#64748B";
    default: return "#64748B";
  }
};
