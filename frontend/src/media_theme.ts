/**
 * Pôle 3 — thème du bloc Media. Deux palettes (sombre premium / clair) avec les mêmes clés ;
 * `useMediaTheme()` suit le réglage Clair / Sombre / Adaptatif du Profil.
 */
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";

export type MediaTheme = typeof mediaDark;

const mediaDark = {
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

const mediaLight: MediaTheme = {
  bg: "#FFFFFF",
  bgElevated: "#F3F4F8",
  bgTop: "#E8EAF3",
  card: "#F3F4F8",
  cardHi: "#E6E8F2",
  border: "#DDE1EC",
  divider: "#E8EAF1",
  text: "#111827",
  textMuted: "#5B6478",
  textDim: "#8A91A3",

  gold: "#D4A017",
  goldSoft: "#FFF4CC",
  ruby: "#E11D48",
  rubySoft: "#FFE4EA",
  violet: "#7C3AED",
  violetSoft: "#EDE4FF",
  violetDeep: "#5B21B6",
  ember: "#EA580C",
};

/** Palette statique (sombre) — à n'utiliser que hors composant. */
export const mediaTheme = mediaDark;

export function useMediaTheme(): MediaTheme {
  const { scheme } = useTheme();
  return scheme === "dark" ? mediaDark : mediaLight;
}

/** StyleSheet dépendant de la palette Media courante (clair / sombre). */
export function makeMediaStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (mediaTheme: MediaTheme) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useMediaStyles(): T {
    const t = useMediaTheme();
    return useMemo(() => StyleSheet.create(factory(t)), [t]);
  };
}

export const categoryHue: Record<string, string> = {
  culte_dimanche: "#7C2D12",
  programmes: "#134E4A",
  programmes_speciaux: "#B45309",
  enseignements: "#4C1D95",
  reunions: "#991B1B",
  podcasts: "#0F766E",
  louange: "#B8860B",
  story: "#BE185D",
};

export const kindLabel: Record<string, string> = {
  audio: "Audio",
  video: "Vidéo",
};

export const initialsOf = (title: string) =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "M";
