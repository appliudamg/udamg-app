import { useState } from "react";
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
import { EventDashboard, EventSession, PointageRecord, profilColor } from "@/src/event-api";
import { downloadExport } from "@/src/downloads";
import { colors, spacing, radius } from "@/src/theme";

export default function Pasteur() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string }>();

  const [startOpen, setStartOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [busyPdf, setBusyPdf] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState<string | null>(null);
  const [purgeText, setPurgeText] = useState("");

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
        <View style={styles.kpiRow}>
          <Kpi label="Total" value={dash?.total ?? 0} color={colors.brandPrimary} />
          <Kpi label="Pointés" value={dash?.pointages_active_session ?? 0} color={colors.success} />
          <Kpi label="Enfants" value={dash?.enfants_active_session ?? 0} color="#F59E0B" />
        </View>

        <View style={styles.kpiRow}>
          <Kpi label="Membres" value={dash?.by_profil?.["Membre"] ?? 0} color={profilColor("Membre")} />
          <Kpi label="Inconnus" value={dash?.by_profil?.["Inconnu"] ?? 0} color={profilColor("Inconnu")} />
          <Kpi label="Prospects" value={(dash?.by_profil?.["Prospect Évangélisé"] ?? 0) + (dash?.by_profil?.["Prospect Famille"] ?? 0)} color={profilColor("Prospect Évangélisé")} />
        </View>

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
          <Text style={styles.sectionTitle}>Arrivées récentes</Text>
          {(recent ?? []).length === 0 ? (
            <Text style={styles.empty}>Aucune arrivée pour l'instant</Text>
          ) : (
            (recent ?? []).map(r => (
              <View key={r.id} style={styles.arrivalRow}>
                <Text style={styles.arrivalDot}>●</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.arrivalName}>{r.participant?.prenom} {r.participant?.nom}</Text>
                  <Text style={styles.arrivalMeta}>
                    {r.participant?.badge_id} · {r.participant?.profil}
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

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[stylesKpi.wrap, { borderColor: color }]}>
      <Text style={[stylesKpi.num, { color }]}>{value}</Text>
      <Text style={stylesKpi.lbl}>{label}</Text>
    </View>
  );
}

const stylesKpi = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, alignItems: "center" },
  num: { fontSize: 22, fontWeight: "900" },
  lbl: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  kpiRow: { flexDirection: "row", gap: spacing.sm },
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
