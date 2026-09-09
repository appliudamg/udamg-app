import React, { useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, MediaItem, Playlist } from "@/src/api";
import { mediaTheme } from "@/src/media_theme";
import { MediaCard } from "@/src/media/MediaCard";
import { BottomNav } from "@/src/media/BottomNav";
import { usePlayer } from "@/src/player";

export default function PlaylistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const player = usePlayer();
  const qc = useQueryClient();

  const pl = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => api<Playlist>(`/playlists/${id}`, {}, token),
    enabled: !!token && !!id,
  });

  const allMedia = useQuery({
    queryKey: ["media", "all"],
    queryFn: () => api<MediaItem[]>("/media", {}, token),
    enabled: !!token,
  });

  const items: MediaItem[] = useMemo(() => {
    if (!pl.data || !allMedia.data) return [];
    const map = new Map(allMedia.data.map((m) => [m.id, m]));
    return pl.data.item_ids.map((iid) => map.get(iid)).filter(Boolean) as MediaItem[];
  }, [pl.data, allMedia.data]);

  const notInPlaylist: MediaItem[] = useMemo(() => {
    if (!pl.data || !allMedia.data) return [];
    const inSet = new Set(pl.data.item_ids);
    return allMedia.data.filter((m) => !inSet.has(m.id));
  }, [pl.data, allMedia.data]);

  const addMut = useMutation({
    mutationFn: (mid: string) => api(`/playlists/${id}/items/${mid}`, { method: "POST" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlist", id] }),
  });

  const removeMut = useMutation({
    mutationFn: (mid: string) => api(`/playlists/${id}/items/${mid}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlist", id] }),
  });

  const askRemove = (m: MediaItem) => {
    const msg = `Retirer "${m.title}" de la playlist ?`;
    const doIt = () => removeMut.mutate(m.id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) doIt();
      return;
    }
    Alert.alert("Confirmer", msg, [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: doIt },
    ]);
  };

  const playAll = () => {
    if (items.length === 0) return;
    player.play(items[0], items).catch(() => {});
    player.openPlayer();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="pl-back" onPress={() => router.push("/(app)/media/library")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PLAYLIST</Text>
          <Text style={styles.title} numberOfLines={1}>{pl.data?.title || "…"}</Text>
        </View>
        {items.length > 0 && (
          <Pressable testID="pl-play-all" onPress={playAll} style={styles.playBtn}>
            <Text style={styles.playTxt}>▶</Text>
          </Pressable>
        )}
      </View>

      {pl.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={mediaTheme.gold} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 220 + insets.bottom }}>
          <Text style={styles.section}>Dans la playlist ({items.length})</Text>
          {items.length === 0 ? (
            <Text style={styles.empty}>Playlist vide. Ajoutez des morceaux ci-dessous.</Text>
          ) : (
            items.map((m) => (
              <MediaCard
                key={m.id}
                item={m}
                onPress={() => { player.play(m, items).catch(() => {}); player.openPlayer(); }}
                right={
                  <Pressable
                    testID={`pl-remove-${m.id}`}
                    onPress={askRemove.bind(null, m)}
                    hitSlop={12}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeTxt}>−</Text>
                  </Pressable>
                }
              />
            ))
          )}

          <Text style={[styles.section, { marginTop: 24 }]}>Ajouter à la playlist</Text>
          {notInPlaylist.length === 0 ? (
            <Text style={styles.empty}>Tous les médias sont déjà ajoutés.</Text>
          ) : (
            notInPlaylist.map((m) => (
              <MediaCard
                key={m.id}
                item={m}
                onPress={() => addMut.mutate(m.id)}
                right={
                  <Pressable
                    testID={`pl-add-${m.id}`}
                    onPress={() => addMut.mutate(m.id)}
                    hitSlop={12}
                    style={styles.addBtn}
                  >
                    <Text style={styles.addTxt}>+</Text>
                  </Pressable>
                }
              />
            ))
          )}
        </ScrollView>
      )}

      <BottomNav active="library" />
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
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: mediaTheme.gold, alignItems: "center", justifyContent: "center" },
  playTxt: { color: "#000", fontWeight: "900", fontSize: 18 },
  section: { color: mediaTheme.text, fontWeight: "800", fontSize: 14, marginTop: 16, marginBottom: 8 },
  empty: { color: mediaTheme.textMuted, textAlign: "center", marginTop: 12, marginBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  removeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: mediaTheme.rubySoft, alignItems: "center", justifyContent: "center" },
  removeTxt: { color: mediaTheme.ruby, fontWeight: "900", fontSize: 20 },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: mediaTheme.goldSoft, alignItems: "center", justifyContent: "center" },
  addTxt: { color: mediaTheme.gold, fontWeight: "900", fontSize: 20 },
});
