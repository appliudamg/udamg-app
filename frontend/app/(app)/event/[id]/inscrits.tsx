import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator,
  RefreshControl, KeyboardAvoidingView, Platform, ScrollView, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api, Ville } from "@/src/api";
import { CATEGORIES_AGE, EVENT_PROFILS, EventParticipant, profilColor } from "@/src/event-api";
import { downloadExport } from "@/src/downloads";
import { colors, spacing, radius } from "@/src/theme";

const TABS = ["Tous", "Membre", "Inconnu", "Prospect Évangélisé", "Prospect Famille", "Externe"] as const;

export default function Inscrits() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string }>();

  const [tab, setTab] = useState<(typeof TABS)[number]>("Tous");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<EventParticipant> | null>(null);
  const [purgeOpen, setPurgeOpen] = useState<null | "all" | "inconnus">(null);
  const [purgeText, setPurgeText] = useState("");
  const sheetRef = useRef<BottomSheet>(null);

  const params = new URLSearchParams({ evenement_id: id });
  if (tab !== "Tous") params.append("profil", tab);
  if (search) params.append("q", search);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["event-participants", id, tab, search],
    queryFn: () => api<EventParticipant[]>(`/event/participants?${params.toString()}`, {}, token),
    enabled: !!token && !!id,
  });

  const { data: villes } = useQuery({
    queryKey: ["villes"],
    queryFn: () => api<Ville[]>("/villes", {}, token),
    enabled: !!token,
  });

  const openNew = () => {
    setEditing({
      nom: "", prenom: "", profil: "Membre", tel: "", email: "", eglise: "",
      jours_presence: [], notes: "",
    });
    setTimeout(() => sheetRef.current?.expand(), 100);
  };

  const openEdit = (p: EventParticipant) => {
    setEditing({ ...p });
    setTimeout(() => sheetRef.current?.expand(), 100);
  };

  const saveMut = useMutation({
    mutationFn: (p: Partial<EventParticipant>) => {
      if (p.id) {
        return api<EventParticipant>(`/event/participants/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nom: p.nom, prenom: p.prenom, profil: p.profil,
            categorie_age: p.categorie_age,
            tel: p.tel, email: p.email, eglise: p.eglise,
            jours_presence: p.jours_presence, notes: p.notes,
          }),
        }, token);
      }
      return api<EventParticipant>(`/event/participants`, {
        method: "POST",
        body: JSON.stringify({
          evenement_id: id, nom: p.nom, prenom: p.prenom, profil: p.profil,
          categorie_age: p.categorie_age,
          tel: p.tel, email: p.email, eglise: p.eglise,
          jours_presence: p.jours_presence,
        }),
      }, token);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["event-participants", id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", id] });
      setEditing(null); sheetRef.current?.close();
      toast.show(`Enregistré · ${r.badge_id}`, "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (pid: string) => api(`/event/participants/${pid}`, { method: "DELETE" }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-participants", id] });
      toast.show("Supprimé", "success");
    },
  });

  const purgeMut = useMutation({
    mutationFn: (only_inconnus: boolean) =>
      api<{ deleted: number }>("/event/participants/purge", {
        method: "POST",
        body: JSON.stringify({ evenement_id: id, confirmation: purgeText, only_inconnus }),
      }, token),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["event-participants", id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", id] });
      setPurgeOpen(null); setPurgeText("");
      toast.show(`${r.deleted} fiche(s) supprimée(s)`, "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  const [busyExport, setBusyExport] = useState(false);
  const runCsvExport = async () => {
    try {
      setBusyExport(true);
      await downloadExport(`/event/exports/participants.csv?evenement_id=${id}`, `participants_${id}.csv`, token);
      toast.show("CSV exporté ✓", "success");
    } catch (e: any) {
      toast.show(e?.message || "Erreur export", "error");
    } finally {
      setBusyExport(false);
    }
  };

  const isPastoral = user?.role === "pasteur" || user?.role === "ouvrier";
  const isPasteur = user?.role === "pasteur";

  const renderBackdrop = useCallback((props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} pressBehavior="close" />
  ), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="inscrits-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{titre || ""}</Text>
          <Text style={styles.title}>Gestion des inscrits</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <Pressable testID="inscrits-export-csv" onPress={runCsvExport} disabled={busyExport} style={[styles.toolBtn, { backgroundColor: colors.success }, busyExport && { opacity: 0.5 }]}>
          {busyExport ? <ActivityIndicator color="#FFF" /> : <Text style={styles.toolTxt}>📊 CSV</Text>}
        </Pressable>
        {isPasteur && (
          <>
            <Pressable testID="inscrits-purge-inconnus" onPress={() => setPurgeOpen("inconnus")} style={[styles.toolBtn, { backgroundColor: colors.warning }]}>
              <Text style={styles.toolTxt}>🗑 Inconnus</Text>
            </Pressable>
            <Pressable testID="inscrits-purge-all" onPress={() => setPurgeOpen("all")} style={[styles.toolBtn, { backgroundColor: colors.error }]}>
              <Text style={styles.toolTxt}>🗑 Tout</Text>
            </Pressable>
          </>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56 }} contentContainerStyle={styles.tabRow}>
        {TABS.map(t => (
          <Pressable key={t} testID={`tab-${t}`} onPress={() => setTab(t)}
                     style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.searchWrap}>
        <TextInput testID="inscrits-search" value={search} onChangeText={setSearch}
                   placeholder="Rechercher (nom, badge, téléphone, église)"
                   placeholderTextColor={colors.muted} style={styles.search} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 96, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty} testID="inscrits-empty">Aucun inscrit</Text>}
          renderItem={({ item }) => (
            <Pressable
              testID={`participant-${item.id}`}
              onPress={() => isPastoral && openEdit(item)}
              onLongPress={() => isPasteur && deleteMut.mutate(item.id)}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.nom} {item.prenom}</Text>
                  <Text style={styles.badge}>{item.badge_id}</Text>
                </View>
                <View style={[styles.profilTag, { backgroundColor: profilColor(item.profil) }]}>
                  <Text style={styles.profilTxt}>{item.profil}</Text>
                </View>
              </View>
              {!!item.eglise && <Text style={styles.meta}>⛪ {item.eglise}</Text>}
              {!!item.categorie_age && <Text style={styles.meta}>👥 {item.categorie_age}</Text>}
              {!!item.tel && <Text style={styles.meta}>📞 {item.tel}</Text>}
              <View style={styles.dots}>
                <View style={[styles.dot, item.sms_status === "sent" ? styles.dotSent : item.sms_status === "pending" ? styles.dotPending : styles.dotNone]} />
                <Text style={styles.dotLbl}>SMS</Text>
                <View style={[styles.dot, item.wa_status === "sent" ? styles.dotSent : item.wa_status === "pending" ? styles.dotPending : styles.dotNone]} />
                <Text style={styles.dotLbl}>WhatsApp</Text>
                <Pressable
                  testID={`participant-badge-${item.id}`}
                  onPress={() => router.push(`/badge?event=${id}&b=${item.badge_id}`)}
                  style={styles.miniBtn}
                >
                  <Text style={styles.miniBtnTxt}>Voir badge →</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}

      {isPastoral && (
        <Pressable testID="inscrits-fab" onPress={openNew} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.fabTxt}>+</Text>
        </Pressable>
      )}

      <BottomSheet
        ref={sheetRef} index={-1} enablePanDownToClose snapPoints={["85%"]}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        onClose={() => setEditing(null)}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <BottomSheetScrollView contentContainerStyle={styles.sheet}>
              <Text style={styles.sheetTitle}>{editing?.id ? `Modifier · ${editing.badge_id}` : "Nouvel inscrit"}</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput testID="form-prenom" placeholder="Prénom" placeholderTextColor={colors.muted}
                           value={editing?.prenom || ""} onChangeText={t => setEditing(e => e ? { ...e, prenom: t } : e)}
                           style={[styles.input, { flex: 1 }]} />
                <TextInput testID="form-nom" placeholder="Nom" placeholderTextColor={colors.muted}
                           value={editing?.nom || ""} onChangeText={t => setEditing(e => e ? { ...e, nom: t } : e)}
                           style={[styles.input, { flex: 1 }]} />
              </View>
              <Text style={styles.label}>Profil</Text>
              <View style={styles.chipRow}>
                {EVENT_PROFILS.map(p => (
                  <Pressable key={p} testID={`form-profil-${p}`} onPress={() => setEditing(e => e ? { ...e, profil: p } : e)}
                             style={[styles.chip, editing?.profil === p && { backgroundColor: profilColor(p), borderColor: profilColor(p) }]}>
                    <Text style={[styles.chipTxt, editing?.profil === p && { color: "#FFFFFF" }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Catégorie (Âge)</Text>
              <View style={styles.chipRow}>
                {CATEGORIES_AGE.map(c => (
                  <Pressable key={c} testID={`form-age-${c}`} onPress={() => setEditing(e => e ? { ...e, categorie_age: c } : e)}
                             style={[styles.chip, editing?.categorie_age === c && styles.chipOn]}>
                    <Text style={[styles.chipTxt, editing?.categorie_age === c && styles.chipTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput testID="form-tel" placeholder="Téléphone" placeholderTextColor={colors.muted}
                         keyboardType="phone-pad" value={editing?.tel || ""}
                         onChangeText={t => setEditing(e => e ? { ...e, tel: t } : e)} style={styles.input} />
              <TextInput testID="form-email" placeholder="Email" placeholderTextColor={colors.muted}
                         autoCapitalize="none" keyboardType="email-address"
                         value={editing?.email || ""}
                         onChangeText={t => setEditing(e => e ? { ...e, email: t } : e)} style={styles.input} />
              <Text style={styles.label}>Église (optionnel)</Text>
              <View style={styles.chipRow}>
                {(villes ?? []).map(v => (
                  <Pressable key={v.id} onPress={() => setEditing(e => e ? { ...e, eglise: v.nom } : e)}
                             style={[styles.chip, editing?.eglise === v.nom && styles.chipOn]}>
                    <Text style={[styles.chipTxt, editing?.eglise === v.nom && styles.chipTxtOn]}>{v.nom}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput testID="form-notes" placeholder="Notes" placeholderTextColor={colors.muted}
                         multiline value={editing?.notes || ""}
                         onChangeText={t => setEditing(e => e ? { ...e, notes: t } : e)}
                         style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} />

              <View style={styles.modalRow}>
                <Pressable onPress={() => sheetRef.current?.close()} style={[styles.btn, styles.btnGrey]}>
                  <Text style={styles.btnGreyTxt}>Fermer</Text>
                </Pressable>
                <Pressable testID="form-save" onPress={() => {
                  if (!editing?.nom || !editing?.prenom) { toast.show("Nom et prénom requis", "error"); return; }
                  saveMut.mutate(editing);
                }} disabled={saveMut.isPending} style={[styles.btn, styles.btnPrimary, saveMut.isPending && { opacity: 0.5 }]}>
                  {saveMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryTxt}>Enregistrer</Text>}
                </Pressable>
              </View>
            </BottomSheetScrollView>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>

      <Modal visible={!!purgeOpen} transparent animationType="fade" onRequestClose={() => setPurgeOpen(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{purgeOpen === "inconnus" ? "Purger les Inconnus" : "Purger tous les inscrits"}</Text>
            <Text style={styles.modalHint}>Tapez SUPPRIMER pour confirmer.</Text>
            <TextInput testID="purge-input" value={purgeText} onChangeText={setPurgeText}
                       placeholder="SUPPRIMER" placeholderTextColor={colors.muted}
                       autoCapitalize="characters" style={styles.input} />
            <View style={styles.modalRow}>
              <Pressable onPress={() => { setPurgeOpen(null); setPurgeText(""); }} style={[styles.btn, styles.btnGrey]}>
                <Text style={styles.btnGreyTxt}>Annuler</Text>
              </Pressable>
              <Pressable testID="purge-submit" disabled={purgeText !== "SUPPRIMER" || purgeMut.isPending}
                         onPress={() => purgeMut.mutate(purgeOpen === "inconnus")}
                         style={[styles.btn, { backgroundColor: colors.error }, (purgeText !== "SUPPRIMER" || purgeMut.isPending) && { opacity: 0.5 }]}>
                {purgeMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryTxt}>Purger</Text>}
              </Pressable>
            </View>
          </View>
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
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  toolbar: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  toolBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minHeight: 40, alignItems: "center", justifyContent: "center" },
  toolTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  tabRow: { paddingHorizontal: spacing.xl, gap: spacing.xs, alignItems: "center" },
  tab: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tabOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  tabTxtOn: { color: colors.onBrandPrimary },
  searchWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  search: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, minHeight: 48 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  badge: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  profilTag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  profilTxt: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12 },
  dots: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSent: { backgroundColor: colors.success },
  dotPending: { backgroundColor: colors.warning },
  dotNone: { backgroundColor: colors.borderStrong },
  dotLbl: { color: colors.muted, fontSize: 11, marginRight: 4 },
  miniBtn: { marginLeft: "auto" },
  miniBtnTxt: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  fab: { position: "absolute", right: spacing.xl, width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  fabTxt: { color: colors.onBrandPrimary, fontSize: 32, fontWeight: "300", marginTop: -4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  sheet: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  chipTxtOn: { color: colors.onBrandPrimary },
  modalRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  modalHint: { color: colors.muted, fontSize: 13 },
});
