import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, MediaItem, Playlist } from "@/src/api";
import { mediaTheme } from "@/src/media_theme";
import { MediaCard } from "@/src/media/MediaCard";
import { BottomNav } from "@/src/media/BottomNav";
import { usePlayer } from "@/src/player";

type Tab = "playlists" | "favorites";

export default function Library() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const player = usePlayer();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("playlists");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: () => api<Playlist[]>("/playlists", {}, token),
    enabled: !!token,
  });

  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api<MediaItem[]>("/media/favorites/list", {}, token),
    enabled: !!token,
  });

  const createMut = useMutation({
    mutationFn: () => api<Playlist>("/playlists", {
      method: "POST",
      body: JSON.stringify({ title: newTitle.trim() || "Nouvelle playlist" }),
    }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      setCreateOpen(false); setNewTitle("");
    },
  });

  const delPlMut = useMutation({
    mutationFn: (pid: string) => api(`/playlists/${pid}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlists"] }),
  });

  const askDeletePl = (pl: Playlist) => {
    const msg = `Supprimer la playlist "${pl.title}" ?`;
    const doIt = () => delPlMut.mutate(pl.id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) doIt();
      return;
    }
    Alert.alert("Confirmer", msg, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: doIt },
    ]);
  };

  const onPlayFav = (item: MediaItem) => {
    player.play(item, favorites.data).catch(() => {});
    player.openPlayer();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="library-back" onPress={() => router.push("/(app)/media")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>BIBLIOTHÈQUE</Text>
          <Text style={styles.title}>Votre collection</Text>
        </View>
        {tab === "playlists" && (
          <Pressable testID="library-create-pl" onPress={() => setCreateOpen(true)} style={styles.addBtn}>
            <Text style={styles.addTxt}>+</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.tabs}>
        <Pressable testID="tab-playlists" onPress={() => setTab("playlists")} style={[styles.tab, tab === "playlists" && styles.tabOn]}>
          <Text style={[styles.tabTxt, tab === "playlists" && styles.tabTxtOn]}>Playlists</Text>
        </Pressable>
        <Pressable testID="tab-favorites" onPress={() => setTab("favorites")} style={[styles.tab, tab === "favorites" && styles.tabOn]}>
          <Text style={[styles.tabTxt, tab === "favorites" && styles.tabTxtOn]}>Favoris</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 220 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {tab === "playlists" ? (
          playlists.isLoading ? (
            <ActivityIndicator color={mediaTheme.gold} style={{ marginTop: 30 }} />
          ) : (playlists.data ?? []).length === 0 ? (
            <Text style={styles.empty}>Aucune playlist — appuyez sur + pour créer votre première.</Text>
          ) : (
            playlists.data!.map((pl) => (
              <Pressable
                key={pl.id}
                testID={`pl-${pl.id}`}
                onPress={() => router.push(`/(app)/media/playlist/${pl.id}`)}
                onLongPress={() => askDeletePl(pl)}
                style={styles.plCard}
              >
                <View style={styles.plCover}>
                  <Text style={styles.plCoverTxt}>♪</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plTitle} numberOfLines={1}>{pl.title}</Text>
                  <Text style={styles.plSub}>{pl.item_ids.length} morceau{pl.item_ids.length > 1 ? "x" : ""}</Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))
          )
        ) : favorites.isLoading ? (
          <ActivityIndicator color={mediaTheme.gold} style={{ marginTop: 30 }} />
        ) : (favorites.data ?? []).length === 0 ? (
          <Text style={styles.empty}>Aucun favori — appuyez sur ♡ pendant l&apos;écoute pour en ajouter.</Text>
        ) : (
          favorites.data!.map((it) => (
            <MediaCard key={it.id} item={it} onPress={() => onPlayFav(it)} />
          ))
        )}
      </ScrollView>

      <BottomNav active="library" />

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ justifyContent: "center", padding: 24 }}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Nouvelle playlist</Text>
              <TextInput
                testID="pl-name"
                autoFocus
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Nom de la playlist"
                placeholderTextColor={mediaTheme.textDim}
                style={styles.input}
              />
              <View style={styles.modalRow}>
                <Pressable onPress={() => setCreateOpen(false)} style={[styles.btn, styles.btnGrey]}>
                  <Text style={styles.btnGreyTxt}>Annuler</Text>
                </Pressable>
                <Pressable
                  testID="pl-submit"
                  onPress={() => createMut.mutate()}
                  disabled={createMut.isPending}
                  style={[styles.btn, styles.btnGold]}
                >
                  {createMut.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.btnGoldTxt}>Créer</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.gold },
  addTxt: { color: "#000", fontWeight: "900", fontSize: 20 },

  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: mediaTheme.card, borderWidth: 1, borderColor: mediaTheme.border },
  tabOn: { backgroundColor: mediaTheme.gold, borderColor: mediaTheme.gold },
  tabTxt: { color: mediaTheme.textMuted, fontWeight: "700", fontSize: 12 },
  tabTxtOn: { color: "#000" },

  plCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: mediaTheme.card, padding: 12, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: mediaTheme.border,
  },
  plCover: { width: 52, height: 52, borderRadius: 10, backgroundColor: mediaTheme.violetDeep, alignItems: "center", justifyContent: "center" },
  plCoverTxt: { color: mediaTheme.gold, fontSize: 24, fontWeight: "800" },
  plTitle: { color: mediaTheme.text, fontSize: 15, fontWeight: "700" },
  plSub: { color: mediaTheme.textMuted, fontSize: 12, marginTop: 2 },
  chev: { color: mediaTheme.textMuted, fontSize: 22 },

  empty: { color: mediaTheme.textMuted, textAlign: "center", marginTop: 40, paddingHorizontal: 20 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalCard: { backgroundColor: mediaTheme.bgTop, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { color: mediaTheme.text, fontSize: 18, fontWeight: "800" },
  input: {
    backgroundColor: mediaTheme.card, color: mediaTheme.text,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48,
    borderWidth: 1, borderColor: mediaTheme.border, fontSize: 15,
  },
  modalRow: { flexDirection: "row", gap: 12 },
  btn: { flex: 1, minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnGrey: { backgroundColor: mediaTheme.card, borderWidth: 1, borderColor: mediaTheme.border },
  btnGreyTxt: { color: mediaTheme.textMuted, fontWeight: "700" },
  btnGold: { backgroundColor: mediaTheme.gold },
  btnGoldTxt: { color: "#000", fontWeight: "800" },
});
