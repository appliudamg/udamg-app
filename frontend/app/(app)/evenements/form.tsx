import { useState } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ChevronLeft, ImagePlus, Trash2 } from "lucide-react-native";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api, Evenement } from "@/src/api";
import { EVENT_TYPES } from "@/src/event-api";
import { useTheme, makeStyles, spacing, radius } from "@/src/theme";

type Form = { titre: string; description: string; lieu: string; ville: string; type_evenement: string; date: string; duree: string; horaires: string; image_url: string };
const EMPTY: Form = { titre: "", description: "", lieu: "", ville: "", type_evenement: "culte_special", date: "", duree: "", horaires: "", image_url: "" };

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Création (sans id) ou modification (?id=) d'un événement — avec import d'affiche. */
export default function EventForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { token } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const existing = useQuery({
    queryKey: ["evenement", id],
    queryFn: () => api<Evenement>(`/evenements/${id}`, {}, token),
    enabled: !!token && !!id,
  });
  if (id && existing.isLoading) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }
  return <Inner key={existing.data?.id ?? "new"} id={id} initial={existing.data ?? null} />;
}

function Inner({ id, initial }: { id?: string; initial: Evenement | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { token } = useAuth();
  const [f, setF] = useState<Form>(initial ? {
    titre: initial.titre, description: initial.description || "", lieu: initial.lieu, ville: initial.ville || "",
    type_evenement: initial.type_evenement, date: toLocalInput(initial.date), duree: initial.duree || "",
    horaires: initial.horaires || "", image_url: initial.image_url || "",
  } : EMPTY);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      let granted = cur.granted;
      if (!granted && cur.canAskAgain) granted = (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
      if (!granted) { toast.show("Autorisation photos requise pour importer une affiche", "error"); return; }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, allowsEditing: true, quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const a: any = res.assets[0];
    try {
      setUploading(true);
      const name = a.fileName || `affiche.${(a.mimeType || "image/jpeg").split("/")[1] || "jpg"}`;
      const mime = a.mimeType || "image/jpeg";
      const signed = await api<{ upload_url: string; public_url: string }>("/evenements/image-upload-url", { method: "POST", body: JSON.stringify({ filename: name }) }, token);
      if (Platform.OS === "web") {
        const body: Blob = a.file && typeof a.file.size === "number" ? a.file : await (await fetch(a.uri)).blob();
        const r = await fetch(signed.upload_url, { method: "PUT", headers: { "Content-Type": mime }, body });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } else {
        const r = await FileSystem.uploadAsync(signed.upload_url, a.uri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": mime } });
        if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      }
      setF((p) => ({ ...p, image_url: signed.public_url }));
      toast.show("Affiche importée", "success");
    } catch (e: any) {
      toast.show(e?.message || "Import impossible", "error");
    } finally { setUploading(false); }
  };

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        titre: f.titre, description: f.description || null, lieu: f.lieu, ville: f.ville || null,
        type_evenement: f.type_evenement, date: new Date(f.date).toISOString(), intervenants: initial?.intervenants ?? [],
        duree: f.duree || null, horaires: f.horaires || null, image_url: f.image_url || null,
      });
      return id ? api<Evenement>(`/evenements/${id}`, { method: "PATCH", body }, token) : api<Evenement>("/evenements", { method: "POST", body }, token);
    },
    onSuccess: (evt) => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      qc.invalidateQueries({ queryKey: ["evenement", evt.id] });
      toast.show(id ? "Événement modifié" : "Événement créé", "success");
      if (id) router.back(); else router.replace(`/(app)/evenements/${evt.id}`);
    },
    onError: (e: any) => toast.show(e?.message || "Enregistrement impossible", "error"),
  });

  const submit = () => {
    if (!f.titre.trim() || !f.lieu.trim() || !f.date) { toast.show("Titre, lieu et date requis", "error"); return; }
    if (isNaN(new Date(f.date).getTime())) { toast.show("Format de date invalide (AAAA-MM-JJTHH:MM)", "error"); return; }
    save.mutate();
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(app)/evenements"));

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="event-form-back" onPress={goBack} style={styles.back} hitSlop={8}>
          <ChevronLeft size={26} color={colors.brandPrimary} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.title}>{id ? "Modifier l'événement" : "Nouvel événement"}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Visuel / affiche</Text>
        <Pressable testID="event-image-pick" onPress={pickImage} disabled={uploading} style={styles.imageBox}>
          {f.image_url ? <Image source={{ uri: f.image_url }} style={styles.image} resizeMode="cover" /> : null}
          <View style={[styles.imageOverlay, !!f.image_url && { backgroundColor: "rgba(15,23,42,0.45)" }]}>
            {uploading ? <ActivityIndicator color="#FFF" /> : <ImagePlus size={28} color={f.image_url ? "#FFF" : colors.brandPrimary} />}
            <Text style={[styles.imageTxt, !!f.image_url && { color: "#FFF" }]}>{f.image_url ? "Changer l'image" : "Importer une image"}</Text>
          </View>
        </Pressable>
        {!!f.image_url && (
          <Pressable testID="event-image-remove" onPress={() => setF({ ...f, image_url: "" })} style={styles.removeImg}>
            <Trash2 size={14} color={colors.error} /><Text style={styles.removeTxt}>Retirer l&apos;image</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Informations</Text>
        <TextInput testID="create-titre" placeholder="Titre *" placeholderTextColor={colors.muted} value={f.titre} onChangeText={t => setF({ ...f, titre: t })} style={styles.input} />
        <TextInput testID="create-description" placeholder="Description" placeholderTextColor={colors.muted} value={f.description} onChangeText={t => setF({ ...f, description: t })} style={[styles.input, { minHeight: 80 }]} multiline />
        <TextInput testID="create-lieu" placeholder="Lieu *" placeholderTextColor={colors.muted} value={f.lieu} onChangeText={t => setF({ ...f, lieu: t })} style={styles.input} />
        <TextInput testID="create-ville" placeholder="Ville" placeholderTextColor={colors.muted} value={f.ville} onChangeText={t => setF({ ...f, ville: t })} style={styles.input} />
        <TextInput testID="create-date" placeholder="Date et heure * (AAAA-MM-JJTHH:MM)" placeholderTextColor={colors.muted} value={f.date} onChangeText={t => setF({ ...f, date: t })} style={styles.input} autoCapitalize="none" />
        <TextInput testID="create-duree" placeholder="Durée (ex. 3 jours, 2h)" placeholderTextColor={colors.muted} value={f.duree} onChangeText={t => setF({ ...f, duree: t })} style={styles.input} />
        <TextInput testID="create-horaires" placeholder="Horaires & programme (ex. Ven 19h · Sam 9h-18h)" placeholderTextColor={colors.muted} value={f.horaires} onChangeText={t => setF({ ...f, horaires: t })} style={[styles.input, { minHeight: 72 }]} multiline />

        <Text style={styles.label}>Type</Text>
        <View style={styles.chipRow}>
          {EVENT_TYPES.map(t => (
            <Pressable key={t.value} testID={`type-${t.value}`} onPress={() => setF({ ...f, type_evenement: t.value })} style={[styles.chip, f.type_evenement === t.value && styles.chipOn]}>
              <Text style={[styles.chipTxt, f.type_evenement === t.value && styles.chipTxtOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable testID="create-submit" onPress={submit} disabled={save.isPending || uploading} style={[styles.cta, (save.isPending || uploading) && { opacity: 0.5 }]}>
          {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaTxt}>{id ? "Enregistrer les modifications" : "Créer l'événement"}</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  back: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1.5, borderColor: colors.brandPrimary },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface, flex: 1 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.md },
  imageBox: { height: 170, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.brandTertiary, borderWidth: 1.5, borderColor: colors.brandSecondary, borderStyle: "dashed" },
  image: { width: "100%", height: "100%" },
  imageOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  imageTxt: { color: colors.brandPrimary, fontWeight: "800" },
  removeImg: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6 },
  removeTxt: { color: colors.error, fontWeight: "700", fontSize: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 50 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, minHeight: 40, justifyContent: "center" },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  chipTxtOn: { color: colors.onBrandPrimary },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, minHeight: 54, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
}));
