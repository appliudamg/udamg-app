import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Modal, TextInput, ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { EventDashboard, EventSession, PointageRecord } from "@/src/event-api";
import { downloadExport } from "@/src/downloads";
import { colors, spacing, radius } from "@/src/theme";

export default function Pasteur() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string; openStart?: string }>();
  const openStart = (useLocalSearchParams() as any).openStart;

  const [startOpen, setStartOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [busyPdf, setBusyPdf] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState<string | null>(null);
  const [purgeText, setPurgeText] = useState("");

  useEffect(() => {
    if (openStart === "1") setStartOpen(true);
  }, [openStart]);

  const { data: dash } = useQuery({
    queryKey: ["event-dashboard", id],
    queryFn: () => api<EventDashboard>(`/event/dashboard?evenement_id=${id}`, {}, token),
    enabled: !!token && !!id,
    refetchInterval: 5000,
  });

  const { data: sessions } = useQuery({
    queryKey: ["event-sessions", id],
    queryFn: () => api<EventSession[]>(`/event/sessions?evenement_id=${id}`, {}, token),
    enabled: !!token && !!id,
  });

  const { data: recent } = useQuery({
    queryKey: ["event-pointages", id],
    queryFn: () => api<PointageRecord[]>(`/event/pointages?evenement_id=${id}&limit=15`, {}, token),
    enabled: !!token && !!id,
    refetchInterval: 4000,
  });

  const startMut = useMutation({
    mutationFn: () => api<EventSession>(`/event/sessions/start`, {
      method: "POST",
      body: JSON.stringify({ evenement_id: id, nom: sessionName || "Nouvelle séance" }),
    }, token),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["event-sessions", id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", id] });
      setStartOpen(false); setSessionName("");
      toast.show(`Séance « ${s.nom} » démarrée`, "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  const stopMut = useMutation({
    mutationFn: (sid: string) => api(`/event/sessions/${sid}/stop`, { method: "POST" }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sessions", id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", id] });
      toast.show("Séance arrêtée", "info");
    },
  });

  const purgeMut = useMutation({
    mutationFn: (sid: string) => api(`/event/sessions/purge-pointages`, {
      method: "POST",
      body: JSON.stringify({ session_id: sid, confirmation: purgeText }),
    }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-pointages", id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", id] });
      setPurgeOpen(null); setPurgeText("");
      toast.show("Pointages purgés", "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  const runBilan = async () => {
    try {
      setBusyPdf(true);
      await downloadExport(`/event/exports/bilan.pdf?evenement_id=${id}`, `bilan_${id}.pdf`, token);
      toast.show("Bilan PDF téléchargé", "success");
    } catch (e: any) {
      toast.show(e?.message || "Erreur", "error");
    } finally { setBusyPdf(false); }
  };

  const isPasteur = user?.role === "pasteur";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="pasteur-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{titre || ""}</Text>
          <Text style={styles.title}>Espace Pasteur</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
        {/* Total Présents banner */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLbl}>TOTAL PRÉSENTS</Text>
          <Text style={styles.heroNum}>{dash?.presence?.total ?? 0}</Text>
          <Text style={styles.heroSub}>
            {dash?.total ? Math.round(((dash?.presence?.total ?? 0) / dash.total) * 100) : 0}% de présence · {dash?.total ?? 0} inscrits
          </Text>
        </View>

        {/* 8 KPI grid */}
        <View style={styles.grid}>
          <KpiBox label="Membres UDAMG" num={dash?.presence?.membres ?? 0} total={dash?.by_profil?.["Membre"] ?? 0} color="#10B981" testID="kpi-membres" />
          <KpiBox label="Invités VIP" num={dash?.presence?.vip ?? 0} total={dash?.presence?.total ?? 0} color="#8B5CF6" testID="kpi-vip" />
          <KpiBox label="Prospects" num={dash?.presence?.prospects ?? 0} total={(dash?.by_profil?.["Prospect Évangélisé"] ?? 0) + (dash?.by_profil?.["Prospect Famille"] ?? 0)} color="#F59E0B" testID="kpi-prospects" />
          <KpiBox label="Enfants" num={dash?.enfants_active_session ?? 0} color="#EC4899" testID="kpi-enfants" />
          <KpiBox label="Gédéon (-18)" num={dash?.presence?.gedeon ?? 0} total={dash?.by_age?.["Gédéon (-18)"] ?? 0} color="#3B82F6" testID="kpi-gedeon" />
          <KpiBox label="J-30 (18-30)" num={dash?.presence?.j30 ?? 0} total={dash?.by_age?.["J-30 (18-30)"] ?? 0} color="#06B6D4" testID="kpi-j30" />
          <KpiBox label="CCMG (+30)" num={dash?.presence?.ccmg ?? 0} total={dash?.by_age?.["CCMG (+30)"] ?? 0} color="#F59E0B" testID="kpi-ccmg" />
          <KpiBox label="Inconnus" num={dash?.presence?.inconnus ?? 0} total={dash?.by_profil?.["Inconnu"] ?? 0} color="#EF4444" testID="kpi-inconnus" />
        </View>

        {/* Répartition par église */}
        {dash?.presence?.by_eglise && Object.keys(dash.presence.by_eglise).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏛 Répartition par église (présents)</Text>
            <View style={styles.chipRow}>
              {Object.entries(dash.presence.by_eglise).map(([e, n]) => (
                <View key={e} style={styles.egliseChip}>
                  <Text style={styles.egliseTxt}>{e}</Text>
                  <View style={styles.egliseCount}><Text style={styles.egliseCountTxt}>{n}</Text></View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contrôle des séances</Text>
          <View style={styles.sessionActions}>
            <Pressable testID="pasteur-start-session" onPress={() => setStartOpen(true)} style={[styles.actBtn, { backgroundColor: colors.success }]}>
              <Text style={styles.actBtnTxt}>▶ Lancer une séance</Text>
            </Pressable>
            <Pressable testID="pasteur-bilan-pdf" onPress={runBilan} disabled={busyPdf} style={[styles.actBtn, { backgroundColor: colors.error }, busyPdf && { opacity: 0.5 }]}>
              {busyPdf ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actBtnTxt}>📄 Rapport bilan PDF</Text>}
            </Pressable>
          </View>

          {(sessions ?? []).map(s => (
            <View key={s.id} style={[styles.sessionRow, s.active && styles.sessionActive]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionNom}>{s.nom} {s.active && <Text style={styles.sessionOnDot}>●</Text>}</Text>
                <Text style={styles.sessionMeta}>
                  {new Date(s.started_at).toLocaleString("fr-FR")}
                  {s.ended_at ? ` → ${new Date(s.ended_at).toLocaleTimeString("fr-FR")}` : ""}
                </Text>
              </View>
              {s.active && (
                <Pressable testID={`stop-${s.id}`} onPress={() => stopMut.mutate(s.id)} style={[styles.miniBtn, { backgroundColor: colors.warning }]}>
                  <Text style={styles.miniBtnTxt}>⏹ Arrêter</Text>
                </Pressable>
              )}
              {isPasteur && (
                <Pressable testID={`purge-${s.id}`} onPress={() => setPurgeOpen(s.id)} style={[styles.miniBtn, { backgroundColor: colors.error, marginLeft: 6 }]}>
                  <Text style={styles.miniBtnTxt}>🗑</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Arrivées récentes (LIVE)</Text>
          {(recent ?? []).length === 0 ? (
            <Text style={styles.empty}>Aucune arrivée pour l'instant</Text>
          ) : (
            (recent ?? []).map(r => (
              <View key={r.id} style={styles.arrivalRow}>
                <Text style={styles.arrivalDot}>●</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.arrivalName}>{r.participant?.prenom} {r.participant?.nom}</Text>
                  <Text style={styles.arrivalMeta}>
                    {r.participant?.badge_id} · {r.participant?.profil}{r.participant?.eglise ? ` · ${r.participant.eglise}` : ""}
                  </Text>
                </View>
                <Text style={styles.arrivalTime}>{new Date(r.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={startOpen} transparent animationType="fade" onRequestClose={() => setStartOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Lancer une séance</Text>
            <Text style={styles.modalHint}>La séance précédente sera automatiquement arrêtée.</Text>
            <TextInput testID="start-session-input" value={sessionName} onChangeText={setSessionName}
                       placeholder="Ex: Culte du matin" placeholderTextColor={colors.muted}
                       style={styles.input} />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setStartOpen(false)} style={[styles.btn, styles.btnGrey]}>
                <Text style={styles.btnGreyTxt}>Annuler</Text>
              </Pressable>
              <Pressable testID="start-session-submit" onPress={() => startMut.mutate()} disabled={startMut.isPending}
                         style={[styles.btn, { backgroundColor: colors.success }, startMut.isPending && { opacity: 0.5 }]}>
                {startMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryTxt}>Lancer</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!purgeOpen} transparent animationType="fade" onRequestClose={() => setPurgeOpen(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Purger les pointages</Text>
            <Text style={styles.modalHint}>Tapez SUPPRIMER pour confirmer</Text>
            <TextInput testID="purge-pointages-input" value={purgeText} onChangeText={setPurgeText}
                       autoCapitalize="characters" placeholder="SUPPRIMER"
                       placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.modalRow}>
              <Pressable onPress={() => { setPurgeOpen(null); setPurgeText(""); }} style={[styles.btn, styles.btnGrey]}>
                <Text style={styles.btnGreyTxt}>Annuler</Text>
              </Pressable>
              <Pressable
                testID="purge-pointages-submit"
                disabled={purgeText !== "SUPPRIMER" || purgeMut.isPending}
                onPress={() => purgeOpen && purgeMut.mutate(purgeOpen)}
                style={[styles.btn, { backgroundColor: colors.error }, (purgeText !== "SUPPRIMER" || purgeMut.isPending) && { opacity: 0.5 }]}
              >
                <Text style={styles.btnPrimaryTxt}>Purger</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function KpiBox({ label, num, total, color, testID }: { label: string; num: number; total?: number; color: string; testID: string }) {
  const pct = total && total > 0 ? Math.round((num / total) * 100) : null;
  return (
    <View style={[stylesKpi.wrap, { borderLeftColor: color }]} testID={testID}>
      <Text style={stylesKpi.lbl}>{label}</Text>
      <Text style={[stylesKpi.num, { color }]}>{num}</Text>
      {total !== undefined && (
        <Text style={stylesKpi.pct}>{num} / {total}{pct !== null ? ` (${pct}%)` : ""}</Text>
      )}
    </View>
  );
}

const stylesKpi = StyleSheet.create({
  wrap: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md,
    borderLeftWidth: 4, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
    gap: 2, minHeight: 88,
  },
  lbl: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  num: { fontSize: 26, fontWeight: "900", marginTop: 2 },
  pct: { color: colors.muted, fontSize: 11, fontWeight: "600" },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  kpiRow: { flexDirection: "row", gap: spacing.sm },
  heroCard: { backgroundColor: colors.surfaceInverse, padding: spacing.xl, borderRadius: radius.lg, alignItems: "center", gap: 4 },
  heroLbl: { color: "#94A3B8", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  heroNum: { color: "#FFFFFF", fontSize: 56, fontWeight: "900" },
  heroSub: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  egliseChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, minHeight: 42,
  },
  egliseTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  egliseCount: { backgroundColor: colors.brandPrimary, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  egliseCountTxt: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800" },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  sessionActions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  actBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: "center", minHeight: 48, justifyContent: "center" },
  actBtnTxt: { color: "#FFFFFF", fontWeight: "800" },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  sessionActive: { borderColor: colors.success, backgroundColor: "#D1FAE5" },
  sessionNom: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  sessionOnDot: { color: colors.success },
  sessionMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  miniBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md },
  miniBtnTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  empty: { color: colors.muted, textAlign: "center", padding: spacing.md, fontStyle: "italic" },
  arrivalRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  arrivalDot: { color: colors.success, fontSize: 12 },
  arrivalName: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  arrivalMeta: { color: colors.muted, fontSize: 11 },
  arrivalTime: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  modalHint: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  modalRow: { flexDirection: "row", gap: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
