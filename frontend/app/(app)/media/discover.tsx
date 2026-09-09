import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, MediaItem } from "@/src/api";
import { mediaTheme, categoryHue } from "@/src/media_theme";
import { MediaCard } from "@/src/media/MediaCard";
import { BottomNav } from "@/src/media/BottomNav";
import { usePlayer } from "@/src/player";

const KIND_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Vidéo" },
  { key: "podcast", label: "Podcasts" },
  { key: "livre", label: "Livres audio" },
];

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const player = usePlayer();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState<string | null>(null);

  const cats = useQuery({
    queryKey: ["media", "categories"],
    queryFn: () => api<{ categories: string[]; kinds: string[] }>("/media/categories", {}, token),
    enabled: !!token,
  });

  const list = useQuery({
    queryKey: ["media", "search", q, kind, category],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (kind !== "all") params.set("kind", kind);
      if (category) params.set("category", category);
      const suffix = params.toString();
      return api<MediaItem[]>(`/media${suffix ? "?" + suffix : ""}`, {}, token);
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => list.data ?? [], [list.data]);
  const onPlay = (item: MediaItem) => { player.play(item, filtered).catch(() => {}); player.openPlayer(); };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="discover-back" onPress={() => router.push("/(app)/media")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DÉCOUVRIR</Text>
          <Text style={styles.title}>Rechercher</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="discover-search"
          value={q}
          onChangeText={setQ}
          placeholder="Titre, orateur, thème…"
          placeholderTextColor={mediaTheme.textDim}
          style={styles.search}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        style={{ maxHeight: 44 }}
      >
        {KIND_FILTERS.map((k) => (
          <Pressable
            key={k.key}
            testID={`kind-${k.key}`}
            onPress={() => setKind(k.key)}
            style={[styles.chip, kind === k.key && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, kind === k.key && styles.chipTxtOn]}>{k.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        style={{ maxHeight: 44, marginTop: 8 }}
      >
        <Pressable onPress={() => setCategory(null)} style={[styles.chip, !category && styles.chipOn]}>
          <Text style={[styles.chipTxt, !category && styles.chipTxtOn]}>Toutes catégories</Text>
        </Pressable>
        {(cats.data?.categories ?? []).map((c) => (
          <Pressable
            key={c}
            testID={`cat-${c}`}
            onPress={() => setCategory(c)}
            style={[
              styles.chip,
              category === c && { backgroundColor: categoryHue[c] || mediaTheme.violet, borderColor: categoryHue[c] || mediaTheme.violet },
            ]}
          >
            <Text style={[styles.chipTxt, category === c && { color: "#FFF" }]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {list.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={mediaTheme.gold} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 220 + insets.bottom }}
          renderItem={({ item }) => (
            <MediaCard item={item} onPress={() => onPlay(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucun média trouvé pour ces filtres.</Text>}
        />
      )}

      <BottomNav active="discover" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.card },
  backTxt: { color: mediaTheme.text, fontSize: 28, marginTop: -4 },
  eyebrow: { color: mediaTheme.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: mediaTheme.text, fontSize: 22, fontWeight: "800" },
  searchWrap: { paddingHorizontal: 20, paddingVertical: 12 },
  search: {
    backgroundColor: mediaTheme.card, color: mediaTheme.text,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48,
    borderWidth: 1, borderColor: mediaTheme.border, fontSize: 15,
  },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.card, borderWidth: 1, borderColor: mediaTheme.border },
  chipOn: { backgroundColor: mediaTheme.gold, borderColor: mediaTheme.gold },
  chipTxt: { color: mediaTheme.textMuted, fontWeight: "700", fontSize: 12 },
  chipTxtOn: { color: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: mediaTheme.textMuted, textAlign: "center", marginTop: 40 },
});
