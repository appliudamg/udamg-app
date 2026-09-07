import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api, Evenement, eventTypeLabel } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const EVENT_TYPES = [
  { value: "sortie_evangelisation", label: "Sortie d'évangélisation" },
  { value: "veillee", label: "Veillée" },
  { value: "culte_special", label: "Culte spécial" },
  { value: "reunion_jeunes", label: "Réunion des jeunes" },
  { value: "reunion_anciens", label: "Réunion des anciens" },
];

export default function EvenementsList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const canCreate = user?.role === "pasteur" || user?.role === "ouvrier";

  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({
    titre: "", description: "", lieu: "", ville: "",
    type_evenement: "culte_special", date: "",
  });

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["evenements"],
    queryFn: () => api<Evenement[]>("/evenements", {}, token),
    enabled: !!token,
  });

  const createMut = useMutation({
    mutationFn: () => api<Evenement>("/evenements", {
      method: "POST",
      body: JSON.stringify({
        titre: f.titre, description: f.description || null,
        lieu: f.lieu, ville: f.ville || null,
        type_evenement: f.type_evenement,
        date: new Date(f.date).toISOString(),
        intervenants: [],
      }),
    }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      setCreateOpen(false);
      setF({ titre: "", description: "", lieu: "", ville: "", type_evenement: "culte_special", date: "" });
      toast.show("Programme créé ✓", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur création", "error"),
  });

  const submit = () => {
    if (!f.titre || !f.lieu || !f.date) {
      toast.show("Titre, lieu et date requis", "error");
      return;
    }
    if (isNaN(new Date(f.date).getTime())) {
      toast.show("Format de date invalide (YYYY-MM-DDTHH:MM)", "error");
      return;
    }
    createMut.mutate();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="evenements-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PÔLE 2 · PORTAIL</Text>
          <Text style={styles.title}>Événements</Text>
        </View>
        {canCreate && (
          <Pressable testID="evenements-create" onPress={() => setCreateOpen(true)} style={styles.newBtn}>
            <Text style={styles.newTxt}>+</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.error}>Erreur de chargement</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryTxt}>Réessayer</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucun événement à venir</Text>}
          renderItem={({ item }) => {
            const d = new Date(item.date);
            return (
              <Pressable
                testID={`evenement-card-${item.id}`}
                onPress={() => router.push(`/(app)/event/${item.id}/hub?titre=${encodeURIComponent(item.titre)}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.datePill}>
                  <Text style={styles.dateDay}>{d.getDate().toString().padStart(2, "0")}</Text>
                  <Text style={styles.dateMonth}>{d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeTag}>{eventTypeLabel(item.type_evenement)}</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                  <Text style={styles.cardMeta}>📍 {item.lieu}{item.ville ? ` · ${item.ville}` : ""}</Text>
                  <Text style={styles.cardMeta}>🕐 {formatDate(item.date)}</Text>
                  <Text style={styles.openHub}>Ouvrir le système d'émargement →</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Nouveau programme</Text>

              <TextInput testID="create-titre" placeholder="Titre du programme"
                         placeholderTextColor={colors.muted}
                         value={f.titre} onChangeText={t => setF({ ...f, titre: t })}
                         style={styles.input} />
              <TextInput testID="create-lieu" placeholder="Lieu"
                         placeholderTextColor={colors.muted}
                         value={f.lieu} onChangeText={t => setF({ ...f, lieu: t })}
                         style={styles.input} />
              <TextInput testID="create-ville" placeholder="Ville"
                         placeholderTextColor={colors.muted}
                         value={f.ville} onChangeText={t => setF({ ...f, ville: t })}
                         style={styles.input} />
              <TextInput testID="create-date" placeholder="Date ISO (2026-03-15T20:00)"
                         placeholderTextColor={colors.muted}
                         value={f.date} onChangeText={t => setF({ ...f, date: t })}
                         style={styles.input} />
              <View style={styles.chipRow}>
                {EVENT_TYPES.map(t => (
                  <Pressable key={t.value}
                             onPress={() => setF({ ...f, type_evenement: t.value })}
                             style={[styles.chip, f.type_evenement === t.value && styles.chipOn]}>
                    <Text style={[styles.chipTxt, f.type_evenement === t.value && styles.chipTxtOn]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalRow}>
                <Pressable onPress={() => setCreateOpen(false)} style={[styles.btn, styles.btnGrey]}>
                  <Text style={styles.btnGreyTxt}>Fermer</Text>
                </Pressable>
                <Pressable testID="create-submit" onPress={submit} disabled={createMut.isPending}
                           style={[styles.btn, styles.btnPrimary, createMut.isPending && { opacity: 0.5 }]}>
                  {createMut.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnPrimaryTxt}>Créer</Text>}
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
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  newBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  newTxt: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "300", marginTop: -3 },
  card: {
    flexDirection: "row", gap: spacing.md, alignItems: "flex-start",
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  datePill: { width: 62, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center" },
  dateDay: { color: colors.onBrandPrimary, fontSize: 22, fontWeight: "800" },
  dateMonth: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  typeTag: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "700", marginBottom: spacing.xs, overflow: "hidden" },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  openHub: { color: colors.brandPrimary, fontWeight: "700", marginTop: spacing.sm, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  error: { color: colors.error },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md },
  retryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  chipTxtOn: { color: colors.onBrandPrimary },
  modalRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
