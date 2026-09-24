import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { usePlayer } from "@/src/player";
import { mediaTheme } from "@/src/media_theme";
import { Heart, Music, Search, type LucideIcon } from "lucide-react-native";

type Tab = "home" | "discover" | "library";

const TABS: { key: Tab; label: string; Icon: LucideIcon; path: string }[] = [
  { key: "home", label: "Accueil", Icon: Music, path: "/(app)/media" },
  { key: "discover", label: "Découvrir", Icon: Search, path: "/(app)/media/discover" },
  { key: "library", label: "Bibliothèque", Icon: Heart, path: "/(app)/media/library" },
];

export function BottomNav({ active }: { active: Tab }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { current } = usePlayer();

  // If a media is playing, push the tab bar up above the mini-player.
  const miniPlayerBump = current ? 66 : 0;

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, 8), bottom: miniPlayerBump },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Pressable
              key={t.key}
              testID={`tab-${t.key}`}
              onPress={() => router.push(t.path as any)}
              style={styles.tab}
              hitSlop={4}
            >
              <t.Icon size={22} color={on ? mediaTheme.gold : mediaTheme.textMuted} />
              <Text style={[styles.label, on && { color: mediaTheme.gold, fontWeight: "800" }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute", left: 0, right: 0,
    paddingHorizontal: 12, paddingTop: 6,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    backgroundColor: mediaTheme.bgTop,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mediaTheme.border,
    paddingVertical: 8,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
    }),
  },
  tab: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 },
  icon: { color: mediaTheme.textMuted, fontSize: 20, lineHeight: 22 },
  label: { color: mediaTheme.textMuted, fontSize: 11 },
});
