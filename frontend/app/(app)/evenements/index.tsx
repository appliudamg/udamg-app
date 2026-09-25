import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api, Evenement, eventTypeLabel } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { canManageEvents, canAdminEvents, canShareEventLink } from "@/src/roles";

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
  const canCreate = canManageEvents(user?.role);

  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({
    titre: "", description: "", lieu: "", ville: "",
    type_evenement: "culte_special", date: "", duree: "", horaires: "", image_url: "",
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
        duree: f.duree || null, horaires: f.horaires || null, image_url: f.image_url || null,
      }),
    }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      setCreateOpen(false);
      setF({ titre: "", description: "", lieu: "", ville: "", type_evenement: "culte_special", date: "", duree: "", horaires: "", image_url: "" });
      toast.show("Programme créé", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur création", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (eid: string) => api(`/evenements/${eid}`, { method: "DELETE" }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evenements"] });
      toast.show("Événement supprimé", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur suppression", "error"),
  });

  const shareLink = async (evt: Evenement) => {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
    const url = `${base}/inscription?event=${evt.id}&titre=${encodeURIComponent(evt.titre)}`;
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(url);
        toast.show("Lien copié", "success");
      } else {
        await Share.share({ message: `Inscription ${evt.titre} : ${url}`, url });
      }
    } catch {
      await Clipboard.setStringAsync(url);
      toast.show("Lien copié", "success");
    }
  };

  const confirmDelete = (evt: Evenement) => {
    const doDelete = () => deleteMut.mutate(evt.id);
    if (Platform.OS === "web") {
      // Alert.alert with buttons is unreliable on react-native-web — use native confirm
      if (typeof window !== "undefined" && window.confirm(`Supprimer « ${evt.titre} » ?\n\nToutes les inscriptions, séances et pointages associés seront supprimés définitivement.`)) {
        doDelete();
      }
      return;
    }
    Alert.alert(
      "Supprimer cet événement ?",
      `« ${evt.titre} » — toutes les inscriptions, séances et pointages associés seront supprimés définitivement.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: doDelete },
      ],
    );
  };

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
        <Pressable testID="evenements-back" onPress={() => router.replace("/(app)/menu")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PÔLE 2 · PORTAIL</Text>
          <Text style={styles.title}>Événements</Text>
        </View>
        {canCreate && (
          <Pressable testID="evenements-create" onPress={() => setCreateOpen(true)} style={styles.newBtn}>
            <Text style={styles.newTxt}>+ Nouveau</Text>
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
          ListHeaderComponent={
            canCreate ? (
              <Pressable
                testID="evenements-create-cta"
                onPress={() => setCreateOpen(true)}
                style={({ pressed }) => [styles.createCta, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.createIcon}><Text style={styles.createIconTxt}>+</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.createTitle}>Créer un nouveau programme</Text>
                  <Text style={styles.createSub}>Culte spécial, veillée, sortie d'évangélisation…</Text>
                </View>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const d = new Date(item.date);
            const isPasteur = canAdminEvents(user?.role);
            return (
              <View style={styles.card} testID={`evenement-card-${item.id}`}>
                <Pressable
                  testID={`evt-open-${item.id}`}
                  onPress={() => router.push(`/(app)/evenements/${item.id}`)}
                  style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.datePill}>
                    <Text style={styles.dateDay}>{d.getDate().toString().padStart(2, "0")}</Text>
                    <Text style={styles.dateMonth}>{d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeTag}>{eventTypeLabel(item.type_evenement)}</Text>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                    <Text style={styles.cardMeta}>{item.lieu}{item.ville ? ` · ${item.ville}` : ""}</Text>
                    <Text style={styles.cardMeta}>{formatDate(item.date)}</Text>
                    <Text style={styles.openHub}>Voir plus →</Text>
                  </View>
                </Pressable>
                <View style={styles.cardActions}>
                  <Pressable
                    testID={`evt-register-${item.id}`}
                    onPress={() => router.push(`/inscription?event=${item.id}&titre=${encodeURIComponent(item.titre)}`)}
                    style={[styles.cardBtn, { backgroundColor: colors.brandPrimary }]}
                  >
                    <Text style={[styles.cardBtnTxt, { color: colors.onBrandPrimary }]}>Je m&apos;inscris</Text>
                  </Pressable>
                  {canShareEventLink(user?.role) && (
                    <Pressable
                      testID={`evt-share-${item.id}`}
                      onPress={() => shareLink(item)}
                      style={[styles.cardBtn, { backgroundColor: colors.brandTertiary }]}
                    >
                      <Text style={[styles.cardBtnTxt, { color: colors.brandPrimary }]}>Copier le lien</Text>
                    </Pressable>
                  )}
                  {isPasteur && (
                    <Pressable
                      testID={`evt-delete-${item.id}`}
                      onPress={() => confirmDelete(item)}
                      style={[styles.cardBtn, { backgroundColor: "#FEE2E2" }]}
                    >
                      <Text style={[styles.cardBtnTxt, { color: colors.error }]}>Supprimer</Text>
                    </Pressable>
                  )}
                </View>
              </View>
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
              <TextInput testID="create-duree" placeholder="Durée (ex. 3 jours, 2h)"
                         placeholderTextColor={colors.muted}
                         value={f.duree} onChangeText={t => setF({ ...f, duree: t })}
                         style={styles.input} />
              <TextInput testID="create-horaires" placeholder="Horaires & détails du programme (ex. Ven 19h · Sam 9h-18h)"
                         placeholderTextColor={colors.muted}
                         value={f.horaires} onChangeText={t => setF({ ...f, horaires: t })}
                         style={[styles.input, { minHeight: 72 }]} multiline />
              <TextInput testID="create-image" placeholder="Lien de l'affiche / logo (optionnel, https://…)"
                         placeholderTextColor={colors.muted}
                         value={f.image_url} onChangeText={t => setF({ ...f, image_url: t })}
                         style={styles.input} autoCapitalize="none" />
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

      {canCreate && (
        <Pressable
          testID="evenements-fab"
          onPress={() => setCreateOpen(true)}
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        >
          <Text style={styles.fabTxt}>+</Text>
        </Pressable>
      )}
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
  newBtn: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  newTxt: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  cardMain: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", padding: spacing.lg },
  cardActions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  cardBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center", minHeight: 40, justifyContent: "center" },
  cardBtnTxt: { fontWeight: "700", fontSize: 12 },
  createCta: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.brandPrimary, padding: spacing.lg,
    borderRadius: radius.lg, marginBottom: spacing.md, minHeight: 72,
    shadowColor: colors.brandPrimary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  createIcon: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  createIconTxt: { color: "#FFFFFF", fontSize: 26, fontWeight: "300", marginTop: -3 },
  createTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  createSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  fab: {
    position: "absolute", right: spacing.xl, width: 60, height: 60, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: colors.brandPrimary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  fabTxt: { color: colors.onBrandPrimary, fontSize: 34, fontWeight: "300", marginTop: -4 },
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
