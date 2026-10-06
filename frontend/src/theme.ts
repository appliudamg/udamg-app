// UDAMG APP theme tokens - filled from /app/design_guidelines.json.
// Pure white minimalist with royal blue "bleu roi" accents.

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#111827",
  surfaceSecondary: "#F8FAFC",
  onSurfaceSecondary: "#334155",
  surfaceTertiary: "#F1F5F9",
  onSurfaceTertiary: "#475569",
  surfaceInverse: "#0F172A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#64748B",

  brand: "#0047AB",
  onBrand: "#FFFFFF",
  brandPrimary: "#0047AB",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#3B82F6",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#EFF6FF",
  onBrandTertiary: "#1D4ED8",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

// Mode sombre — mêmes clés que `light`
const dark: ThemeColors = {
  surface: "#0B1220",
  onSurface: "#F1F5F9",
  surfaceSecondary: "#111B2E",
  onSurfaceSecondary: "#CBD5E1",
  surfaceTertiary: "#182440",
  onSurfaceTertiary: "#94A3B8",
  surfaceInverse: "#F8FAFC",
  onSurfaceInverse: "#0F172A",
  muted: "#94A3B8",

  brand: "#3B82F6",
  onBrand: "#FFFFFF",
  brandPrimary: "#3B82F6",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#60A5FA",
  onBrandSecondary: "#0B1220",
  brandTertiary: "#1E3A8A",
  onBrandTertiary: "#BFDBFE",

  success: "#34D399",
  onSuccess: "#052E16",
  warning: "#FBBF24",
  onWarning: "#1F2937",
  error: "#F87171",
  onError: "#1F2937",
  info: "#60A5FA",
  onInfo: "#0B1220",

  border: "#1F2A44",
  borderStrong: "#334155",
  divider: "#162036",
};

export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

/** Préférence utilisateur : clair / sombre / adaptatif (suit le téléphone). */
export type ThemePreference = "light" | "dark" | "system";
const PREF_KEY = "udamg.theme";

type ThemeCtx = { scheme: ColorScheme; colors: ThemeColors; preference: ThemePreference; setPreference: (p: ThemePreference) => void };
const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>("light");
  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setPref(v);
    }).catch(() => {});
  }, []);
  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    AsyncStorage.setItem(PREF_KEY, p).catch(() => {});
  }, []);
  const scheme: ColorScheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
  const value = useMemo(() => ({ scheme, colors: themes[scheme], preference, setPreference }), [scheme, preference, setPreference]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme();
  if (ctx) return ctx;
  const scheme: ColorScheme = system === "dark" ? "dark" : "light";
  return { scheme, colors: themes[scheme], preference: "system", setPreference: () => {} };
}

/** Palette claire statique (composants non thémés, ex. écran d'erreur). */
export const colors = light;

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
