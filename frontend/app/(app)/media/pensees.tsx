import { useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, Image, ActivityIndicator, Modal, ScrollView, Platform, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ChevronLeft, Plus, Trash2, ImagePlus, Sparkles } from "lucide-react-native";
import { api, Pensee } from "@/src/api";
import { useAuth } from "@/src/auth";
import { canEditPensees } from "@/src/roles";
import { useToast } from "@/src/toast";
import { confirmAction } from "@/src/confirm";
import { mediaTheme } from "@/src/media_theme";

type Pick = { uri: string; name: string; mimeType: string; file?: File };

const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Pensees() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { user, token } = useAuth();
  const canEdit = canEditPensees(user?.role);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("");
  const [texte, setTexte] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({ queryKey: ["pensees"], queryFn: () => api<Pensee[]>("/pensees", {}, token), enabled: !!token });

  const del = useMutation({
    mutationFn: (id: string) => api(`/pensees/${id}`, { method: "DELETE" }, token),
    onSuccess: () => { toast("Pensée supprimée", "success"); qc.invalidateQueries({ queryKey: ["pensees"] }); },
    onError: (e: any) => toast(e?.message || "Suppression impossible", "error"),
  });

  const chooseImage = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted" && Platform.OS !== "web") { toast("Autorisez l'accès aux photos dans les réglages", "error"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPick({ uri: a.uri, name: a.fileName || "pensee.jpg", mimeType: a.mimeType || "image/jpeg", file: (a as any).file });
  };

  const publish = async () => {
    if (!theme.trim()) { toast("Le thème est requis", "error"); return; }
    setBusy(true);
    try {
      let image_path: string | null = null;
      if (pick) {
        const signed = await api<{ upload_url: string; path: string }>("/pensees/upload-url", { method: "POST", body: JSON.stringify({ filename: pick.name, content_type: pick.mimeType }) }, token);
        if (Platform.OS === "web") {
          const body: Blob = pick.file && typeof pick.file.size === "number" ? pick.file : await (await fetch(pick.uri)).blob();
          const r = await fetch(signed.upload_url, { method: "PUT", headers: { "Content-Type": pick.mimeType }, body });
          if (!r.ok) throw new Error(`Upload HTTP ${r.status}`);
        } else {
          const r = await FileSystem.uploadAsync(signed.upload_url, pick.uri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": pick.mimeType } });
          if (r.status >= 400) throw new Error(`Upload HTTP ${r.status}`);
        }
        image_path = signed.path;
      }
      await api("/pensees", { method: "POST", body: JSON.stringify({ theme: theme.trim(), texte: texte.trim() || null, date, image_path }) }, token);
      qc.invalidateQueries({ queryKey: ["pensees"] });
      toast("Pensée du jour publiée", "success");
      setOpen(false); setTheme(""); setTexte(""); setPick(null);
    } catch (e: any) {
      toast(e?.message || "Publication impossible", "error");
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="pensees-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/media/discover" as any))} style={styles.iconBtn}><ChevronLeft size={26} color={mediaTheme.text} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pensée du jour</Text>
          <Text style={styles.sub}>{list.data?.length ?? 0} pensée(s)</Text>
        </View>
        {canEdit && (
          <Pressable testID="pensee-add" onPress={() => setOpen(true)} style={styles.addBtn}><Plus size={18} color="#000" /><Text style={styles.addTxt}>Ajouter</Text></Pressable>
        )}
      </View>

      {list.isLoading ? <ActivityIndicator color={mediaTheme.gold} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 120 }}
          ListEmptyComponent={<View style={styles.empty}><Sparkles size={36} color={mediaTheme.textDim} /><Text style={styles.emptyTxt}>Aucune pensée publiée pour le moment.</Text></View>}
          renderItem={({ item, index }) => (
            <View style={[styles.card, index === 0 && styles.cardFirst]} testID={`pensee-${item.id}`}>
              {!!item.image_url && <Image source={{ uri: item.image_url }} style={styles.img} resizeMode="cover" />}
              <View style={styles.cardBody}>
                <Text style={styles.date}>{fmtDate(item.date)}{index === 0 ? " · Dernière pensée" : ""}</Text>
                <Text style={styles.theme}>{item.theme}</Text>
                {!!item.texte && <Text style={styles.texte}>{item.texte}</Text>}
                {canEdit && (
                  <Pressable testID={`pensee-delete-${item.id}`} onPress={() => confirmAction("Supprimer cette pensée ?", item.theme, () => del.mutate(item.id))} style={styles.delBtn}>
                    <Trash2 size={16} color={mediaTheme.ruby} /><Text style={styles.delTxt}>Supprimer</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHead}>
              <Text style={styles.title}>Nouvelle pensée</Text>
              <Pressable testID="pensee-cancel" onPress={() => setOpen(false)} hitSlop={8}><Text style={styles.cancel}>Annuler</Text></Pressable>
            </View>
            <Text style={styles.label}>Thème</Text>
            <TextInput testID="pensee-theme" value={theme} onChangeText={setTheme} placeholder="Ex. La persévérance dans la prière" placeholderTextColor={mediaTheme.textDim} style={styles.input} maxLength={120} />
            <Text style={styles.label}>Texte (optionnel)</Text>
            <TextInput testID="pensee-texte" value={texte} onChangeText={setTexte} placeholder="Verset, méditation…" placeholderTextColor={mediaTheme.textDim} style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]} multiline />
            <Text style={styles.label}>Date (AAAA-MM-JJ)</Text>
            <TextInput testID="pensee-date" value={date} onChangeText={setDate} placeholder="2026-06-30" placeholderTextColor={mediaTheme.textDim} style={styles.input} autoCapitalize="none" />
            <Text style={styles.label}>Image (optionnel)</Text>
            <Pressable testID="pensee-pick-image" onPress={chooseImage} style={styles.pickBtn}>
              {pick ? <Image source={{ uri: pick.uri }} style={styles.pickPreview} resizeMode="cover" /> : <><ImagePlus size={24} color={mediaTheme.gold} /><Text style={styles.pickTxt}>Choisir une image</Text></>}
            </Pressable>
            <Pressable testID="pensee-publish" disabled={busy || !theme.trim()} onPress={publish} style={[styles.cta, (busy || !theme.trim()) && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaTxt}>Publier</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: mediaTheme.text, fontSize: 22, fontWeight: "800" },
  sub: { color: mediaTheme.textMuted, fontSize: 12 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: mediaTheme.gold, paddingHorizontal: 14, minHeight: 42, borderRadius: 999 },
  addTxt: { color: "#000", fontWeight: "800" },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyTxt: { color: mediaTheme.textMuted },
  card: { backgroundColor: mediaTheme.card, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: mediaTheme.border },
  cardFirst: { borderColor: mediaTheme.gold },
  img: { width: "100%", height: 180 },
  cardBody: { padding: 16, gap: 6 },
  date: { color: mediaTheme.gold, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  theme: { color: mediaTheme.text, fontSize: 18, fontWeight: "800" },
  texte: { color: mediaTheme.textMuted, fontSize: 15, lineHeight: 22 },
  delBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 40, marginTop: 4 },
  delTxt: { color: mediaTheme.ruby, fontWeight: "700", fontSize: 13 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cancel: { color: mediaTheme.gold, fontWeight: "700", padding: 8 },
  label: { color: mediaTheme.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
  input: { borderWidth: 1, borderColor: mediaTheme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, color: mediaTheme.text, backgroundColor: mediaTheme.card, fontSize: 15 },
  pickBtn: { minHeight: 90, borderRadius: 14, borderWidth: 1, borderColor: mediaTheme.border, backgroundColor: mediaTheme.card, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  pickPreview: { width: "100%", height: 180 },
  pickTxt: { color: mediaTheme.text, fontWeight: "600" },
  cta: { backgroundColor: mediaTheme.gold, borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center", marginTop: 10 },
  ctaTxt: { color: "#000", fontWeight: "800", fontSize: 16 },
});
