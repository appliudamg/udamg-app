/**
 * Pôle 3 — Dark premium theme (isolated from the rest of the app).
 * Rouge / doré / violet on a deep midnight background.
 */
export const mediaTheme = {
  bg: "#0B0B12",
  bgElevated: "#161622",
  bgTop: "#1F1D2E",
  card: "#1C1B26",
  cardHi: "#26243A",
  border: "#2D2B40",
  divider: "#232232",
  text: "#F4F1FF",
  textMuted: "#A29CB8",
  textDim: "#6E687F",

  gold: "#F5C518",
  goldSoft: "#3A320B",
  ruby: "#E11D48",
  rubySoft: "#3A0A18",
  violet: "#8B5CF6",
  violetSoft: "#2A1D48",
  violetDeep: "#4C1D95",
  ember: "#F97316",
};

export const categoryHue: Record<string, string> = {
  "Foi & Méditation": "#134E4A",
  "Leadership": "#4C1D95",
  "Enseignements du Dimanche": "#7C2D12",
  "Prières & Worship": "#B45309",
  "Podcasts": "#0F766E",
  "Livres Audio": "#991B1B",
};

export const kindLabel: Record<string, string> = {
  audio: "Audio",
  video: "Vidéo",
  podcast: "Podcast",
  livre: "Livre audio",
};

export const initialsOf = (title: string) =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "M";
