import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert,
  Platform, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/src/auth";
import { api, MediaItem, mediaCoverUrl } from "@/src/api";
import { mediaTheme, categoryHue, initialsOf } from "@/src/media_theme";

type FormPick = { uri: string; name: string; mimeType?: string | null; size?: number | null; file?: File | null };

export default function MediaAdmin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const canManage = user?.role === "pasteur" || user?.role === "ouvrier";

  const cats = useQuery({
    queryKey: ["media", "categories"],
    queryFn: () => api<{ categories: string[]; kinds: string[] }>("/media/categories", {}, token),
    enabled: !!token,
  });

  const list = useQuery({
    queryKey: ["media", "admin", "list"],
    queryFn: () => api<MediaItem[]>("/media", {}, token),
    enabled: !!token,
  });

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState<string>("Enseignements du Dimanche");
  const [kind, setKind] = useState<string>("audio");
  const [description, setDescription] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState<FormPick | null>(null);
  const [cover, setCover] = useState<FormPick | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["audio/*", "video/*"], multiple: false, copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a: any = res.assets[0];
      setAudio({
        uri: a.uri,
        name: a.name || `audio.${(a.mimeType || "mp3").split("/")[1]}`,
        mimeType: a.mimeType,
        size: a.size,
        file: a.file ?? null, // web: File object from the browser picker
      });
    }
  };

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as any,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) {
      const a: any = res.assets[0];
      setCover({
        uri: a.uri,
        name: a.fileName || "cover.jpg",
        mimeType: a.mimeType,
        size: a.fileSize,
        file: a.file ?? null,
      });
    }
  };

  const resetForm = () => {
    setTitle(""); setAuthor(""); setDescription(""); setTranscript("");
    setAudio(null); setCover(null);
  };

  const submit = async () => {
    if (!token) return;
    if (!title.trim() || !author.trim()) {
      toast("Titre et orateur requis"); return;
    }
    const form = new FormData();
    form.append("title", title.trim());
    form.append("author", author.trim());
    form.append("category", category);
    form.append("kind", kind);
    if (description.trim()) form.append("description", description.trim());
    if (transcript.trim()) form.append("transcript", transcript.trim());

    if (audio) {
      if (Platform.OS === "web") {
        // On web, prefer the File object directly (avoids blob URL fetch issues)
        if (audio.file && typeof (audio.file as any).name === "string") {
          form.append("audio", audio.file, audio.file.name || audio.name);
        } else {
          try {
            const resp = await fetch(audio.uri);
            const blob = await resp.blob();
            if (!blob.size) throw new Error("Fichier audio vide");
            // Wrap in a File to guarantee filename + content-type
            const f = new File([blob], audio.name, { type: audio.mimeType || blob.type || "audio/mpeg" });
            form.append("audio", f, audio.name);
          } catch (e) {
            toast(`Impossible de lire le fichier audio: ${(e as Error).message}`);
            return;
          }
        }
      } else {
        form.append("audio", { uri: audio.uri, name: audio.name, type: audio.mimeType || "audio/mpeg" } as any);
      }
    }
    if (cover) {
      if (Platform.OS === "web") {
        if (cover.file && typeof (cover.file as any).name === "string") {
          form.append("cover", cover.file, cover.file.name || cover.name);
        } else {
          try {
            const resp = await fetch(cover.uri);
            const blob = await resp.blob();
            if (!blob.size) throw new Error("Pochette vide");
            const f = new File([blob], cover.name, { type: cover.mimeType || blob.type || "image/jpeg" });
            form.append("cover", f, cover.name);
          } catch (e) {
            toast(`Impossible de lire la pochette: ${(e as Error).message}`);
            return;
          }
        }
      } else {
        form.append("cover", { uri: cover.uri, name: cover.name, type: cover.mimeType || "image/jpeg" } as any);
      }
    }

    setUploading(true);
    try {
      const BASE = process.env.EXPO_PUBLIC_BACKEND_URL!;
      const res = await fetch(`${BASE}/api/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form as any,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(body || `HTTP ${res.status}`);
      toast("Média créé ✓");
      resetForm();
      qc.invalidateQueries({ queryKey: ["media"] });
      qc.invalidateQueries({ queryKey: ["media", "admin", "list"] });
    } catch (e: any) {
      toast(`Erreur upload: ${e.message || e}`);
    } finally {
      setUploading(false);
    }
  };

  const askDelete = (m: MediaItem) => {
    const doIt = async () => {
      try {
        await api(`/media/${m.id}`, { method: "DELETE" }, token);
        toast("Média supprimé");
        qc.invalidateQueries({ queryKey: ["media"] });
        qc.invalidateQueries({ queryKey: ["media", "admin", "list"] });
      } catch (e: any) { toast(`Erreur: ${e.message}`); }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Supprimer "${m.title}" ?`)) doIt();
      return;
    }
    Alert.alert("Confirmer", `Supprimer "${m.title}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: doIt },
    ]);
  };

  if (!canManage) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={{ color: mediaTheme.text, fontSize: 18, fontWeight: "800" }}>Accès réservé</Text>
        <Text style={{ color: mediaTheme.textMuted, marginTop: 8 }}>Seul un Pasteur ou un Ouvrier peut uploader du contenu.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: mediaTheme.gold, borderRadius: 999 }}>
          <Text style={{ color: "#000", fontWeight: "800" }}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="admin-back" onPress={() => router.push("/(app)/media")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ADMIN · MÉDIAS</Text>
          <Text style={styles.title}>Console de gestion</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Nouveau média</Text>

          <Field label="Titre">
            <TextInput testID="admin-title" value={title} onChangeText={setTitle}
              placeholder="Ex. La grâce qui transforme"
              placeholderTextColor={mediaTheme.textDim} style={styles.input} />
          </Field>

          <Field label="Orateur / Auteur">
            <TextInput testID="admin-author" value={author} onChangeText={setAuthor}
              placeholder="Ex. Pasteur Marc"
              placeholderTextColor={mediaTheme.textDim} style={styles.input} />
          </Field>

          <Field label="Catégorie">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {(cats.data?.categories ?? []).map((c) => (
                <Pressable key={c} testID={`admin-cat-${c}`} onPress={() => setCategory(c)}
                  style={[styles.chip, category === c && { backgroundColor: categoryHue[c] || mediaTheme.violet, borderColor: categoryHue[c] || mediaTheme.violet }]}>
                  <Text style={[styles.chipTxt, category === c && { color: "#FFF" }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="Type">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {(cats.data?.kinds ?? ["audio"]).map((k) => (
                <Pressable key={k} testID={`admin-kind-${k}`} onPress={() => setKind(k)}
                  style={[styles.chip, kind === k && styles.chipOn]}>
                  <Text style={[styles.chipTxt, kind === k && { color: "#000" }]}>{k}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="Description">
            <TextInput testID="admin-desc" value={description} onChangeText={setDescription}
              placeholder="Résumé court"
              placeholderTextColor={mediaTheme.textDim} multiline style={[styles.input, { minHeight: 80 }]} />
          </Field>

          <Field label="Transcription / Notes (onglet Script du player)">
            <TextInput testID="admin-transcript" value={transcript} onChangeText={setTranscript}
              placeholder="Texte du message ou notes détaillées"
              placeholderTextColor={mediaTheme.textDim} multiline style={[styles.input, { minHeight: 100 }]} />
          </Field>

          <Field label={`Fichier audio${audio ? ` — ${audio.name}` : ""}`}>
            <Pressable testID="admin-pick-audio" onPress={pickAudio} style={styles.filePick}>
              <Text style={styles.filePickTxt}>{audio ? "🔁 Remplacer le fichier" : "📁 Sélectionner un fichier audio (MP3/AAC/MP4)"}</Text>
            </Pressable>
          </Field>

          <Field label={`Pochette${cover ? ` — ${cover.name}` : ""}`}>
            <Pressable testID="admin-pick-cover" onPress={pickCover} style={styles.filePick}>
              <Text style={styles.filePickTxt}>{cover ? "🔁 Remplacer la pochette" : "🖼 Choisir une image de pochette"}</Text>
            </Pressable>
          </Field>

          <Pressable testID="admin-submit" onPress={submit} disabled={uploading}
            style={[styles.submit, uploading && { opacity: 0.6 }]}>
            {uploading ? <ActivityIndicator color="#000" /> : <Text style={styles.submitTxt}>Publier le média</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Bibliothèque ({list.data?.length ?? 0})</Text>
        {(list.data ?? []).map((m) => (
          <View key={m.id} style={styles.rowCard}>
            <View style={[styles.rowCover, { backgroundColor: categoryHue[m.category] || mediaTheme.violetDeep }]}>
              {m.cover_path ? (
                <Image source={{ uri: mediaCoverUrl(m.id) }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text style={{ color: "#FFF", fontWeight: "900" }}>{initialsOf(m.title)}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {m.author} · {m.category}
                {m.audio_path ? "" : " · sans audio"}
              </Text>
            </View>
            <Pressable testID={`admin-del-${m.id}`} onPress={() => askDelete(m)} style={styles.delBtn} hitSlop={8}>
              <Text style={styles.delTxt}>×</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function toast(msg: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    (window as any).__mediaToast?.(msg) ?? window.alert(msg);
    return;
  }
  Alert.alert("", msg);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 40 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.card },
  backTxt: { color: mediaTheme.text, fontSize: 28, marginTop: -4 },
  eyebrow: { color: mediaTheme.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: mediaTheme.text, fontSize: 22, fontWeight: "800" },

  card: { backgroundColor: mediaTheme.card, borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: mediaTheme.border, marginBottom: 24 },
  sectionTitle: { color: mediaTheme.text, fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 8 },
  label: { color: mediaTheme.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },

  input: {
    backgroundColor: mediaTheme.bgTop, color: mediaTheme.text,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44,
    borderWidth: 1, borderColor: mediaTheme.border, fontSize: 14,
  },

  chip: { paddingHorizontal: 14, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.bgTop, borderWidth: 1, borderColor: mediaTheme.border },
  chipOn: { backgroundColor: mediaTheme.gold, borderColor: mediaTheme.gold },
  chipTxt: { color: mediaTheme.textMuted, fontWeight: "700", fontSize: 12 },

  filePick: { padding: 14, backgroundColor: mediaTheme.bgTop, borderRadius: 10, borderWidth: 1, borderColor: mediaTheme.border, borderStyle: "dashed" },
  filePickTxt: { color: mediaTheme.gold, fontWeight: "700", textAlign: "center" },

  submit: { backgroundColor: mediaTheme.gold, padding: 14, borderRadius: 12, alignItems: "center", marginTop: 6 },
  submitTxt: { color: "#000", fontWeight: "800", fontSize: 15 },

  rowCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: mediaTheme.card, padding: 10, borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: mediaTheme.border,
  },
  rowCover: { width: 46, height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rowTitle: { color: mediaTheme.text, fontWeight: "700", fontSize: 14 },
  rowSub: { color: mediaTheme.textMuted, fontSize: 12, marginTop: 2 },
  delBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: mediaTheme.rubySoft, alignItems: "center", justifyContent: "center" },
  delTxt: { color: mediaTheme.ruby, fontWeight: "900", fontSize: 22, marginTop: -2 },
});
