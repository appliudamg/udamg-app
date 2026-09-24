import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Image, ActivityIndicator, ScrollView, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ChevronLeft, ImagePlus, Video, Clock } from "lucide-react-native";
import { api, Story } from "@/src/api";
import { useAuth } from "@/src/auth";
import { canWriteMedia } from "@/src/roles";
import { useToast } from "@/src/toast";
import { mediaTheme } from "@/src/media_theme";

type Pick = { uri: string; name: string; mimeType: string; kind: "image" | "video"; file?: File };
const DURATIONS = [24, 48, 72];

export default function StoryNew() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { user, token } = useAuth();
  const [pick, setPick] = useState<Pick | null>(null);
  const [caption, setCaption] = useState("");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);

  if (!canWriteMedia(user?.role)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingHorizontal: 20 }]}>
        <Text style={styles.title}>Stories</Text>
        <Text style={styles.muted}>Seule l&apos;Équipe technique peut publier des stories.</Text>
      </View>
    );
  }

  const choose = async (kind: "image" | "video") => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted" && Platform.OS !== "web") {
      Alert.alert("Accès à la galerie", "Autorisez l'accès aux photos pour publier une story.", [
        { text: "Annuler", style: "cancel" },
        { text: "Ouvrir les réglages", onPress: () => import("expo-linking").then((L) => L.openSettings()) },
      ]);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "image" ? ["images"] : ["videos"],
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const name = a.fileName || `story.${kind === "image" ? "jpg" : "mp4"}`;
    const mime = a.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4");
    setPick({ uri: a.uri, name, mimeType: mime, kind, file: (a as any).file });
  };

  const publish = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const created = await api<Story>("/stories/create-json", {
        method: "POST", body: JSON.stringify({ kind: pick.kind, caption: caption.trim() || null, duration_hours: hours }),
      }, token);
      const signed = await api<{ upload_url: string; path: string }>(`/stories/${created.id}/upload-url`, {
        method: "POST", body: JSON.stringify({ filename: pick.name, content_type: pick.mimeType }),
      }, token);
      if (Platform.OS === "web") {
        const body: Blob = pick.file && typeof pick.file.size === "number" ? pick.file : await (await fetch(pick.uri)).blob();
        const r = await fetch(signed.upload_url, { method: "PUT", headers: { "Content-Type": pick.mimeType }, body });
        if (!r.ok) throw new Error(`Upload HTTP ${r.status}`);
      } else {
        const r = await FileSystem.uploadAsync(signed.upload_url, pick.uri, {
          httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": pick.mimeType },
        });
        if (r.status >= 400) throw new Error(r.body?.slice(0, 120) || `HTTP ${r.status}`);
      }
      await api(`/stories/${created.id}/confirm`, { method: "POST", body: JSON.stringify({ path: signed.path }) }, token);
      qc.invalidateQueries({ queryKey: ["stories"] });
      toast("Story publiée", "success");
      router.back();
    } catch (e: any) {
      toast(e?.message || "Publication impossible", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="story-new-back" onPress={() => router.back()} style={styles.back}><ChevronLeft size={26} color={mediaTheme.text} /></Pressable>
        <Text style={styles.title}>Nouvelle story</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>Visible par tous les utilisateurs, puis supprimée automatiquement.</Text>

        <View style={styles.pickRow}>
          <Pressable testID="story-pick-image" onPress={() => choose("image")} style={[styles.pickBtn, pick?.kind === "image" && styles.pickOn]}>
            <ImagePlus size={26} color={mediaTheme.gold} />
            <Text style={styles.pickTxt}>Photo</Text>
          </Pressable>
          <Pressable testID="story-pick-video" onPress={() => choose("video")} style={[styles.pickBtn, pick?.kind === "video" && styles.pickOn]}>
            <Video size={26} color={mediaTheme.gold} />
            <Text style={styles.pickTxt}>Vidéo (≤ 60 s)</Text>
          </Pressable>
        </View>

        {pick && (
          <View style={styles.preview}>
            {pick.kind === "image" ? <Image source={{ uri: pick.uri }} style={styles.previewImg} resizeMode="cover" /> : (
              <View style={[styles.previewImg, styles.center]}><Video size={40} color={mediaTheme.gold} /><Text style={styles.muted}>{pick.name}</Text></View>
            )}
          </View>
        )}

        <Text style={styles.label}>Légende (optionnel)</Text>
        <TextInput testID="story-caption" value={caption} onChangeText={setCaption} placeholder="Ex. Convention 2026 — J-3" placeholderTextColor={mediaTheme.textDim} style={styles.input} maxLength={140} />

        <Text style={styles.label}>Durée de visibilité</Text>
        <View style={styles.pickRow}>
          {DURATIONS.map((h) => (
            <Pressable key={h} testID={`story-hours-${h}`} onPress={() => setHours(h)} style={[styles.chip, hours === h && styles.chipOn]}>
              <Clock size={14} color={hours === h ? "#000" : mediaTheme.textMuted} />
              <Text style={[styles.chipTxt, hours === h && { color: "#000" }]}>{h} h</Text>
            </Pressable>
          ))}
        </View>

        <Pressable testID="story-publish" disabled={!pick || busy} onPress={publish} style={[styles.cta, (!pick || busy) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaTxt}>Publier la story</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: mediaTheme.text, fontSize: 22, fontWeight: "800" },
  muted: { color: mediaTheme.textMuted, fontSize: 13 },
  label: { color: mediaTheme.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  pickRow: { flexDirection: "row", gap: 10 },
  pickBtn: { flex: 1, minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: mediaTheme.border, backgroundColor: mediaTheme.card, alignItems: "center", justifyContent: "center", gap: 6 },
  pickOn: { borderColor: mediaTheme.gold, backgroundColor: mediaTheme.goldSoft },
  pickTxt: { color: mediaTheme.text, fontWeight: "600", fontSize: 13 },
  preview: { borderRadius: 16, overflow: "hidden", backgroundColor: mediaTheme.card },
  previewImg: { width: "100%", aspectRatio: 9 / 14, maxHeight: 360 },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  input: { borderWidth: 1, borderColor: mediaTheme.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 50, color: mediaTheme.text, backgroundColor: mediaTheme.card, fontSize: 15 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: mediaTheme.border, backgroundColor: mediaTheme.card },
  chipOn: { backgroundColor: mediaTheme.gold, borderColor: mediaTheme.gold },
  chipTxt: { color: mediaTheme.textMuted, fontWeight: "700", fontSize: 13 },
  cta: { backgroundColor: mediaTheme.gold, borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ctaTxt: { color: "#000", fontWeight: "800", fontSize: 16 },
});
