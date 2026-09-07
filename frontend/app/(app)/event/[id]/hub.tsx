import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { EventDashboard } from "@/src/event-api";
import { colors, spacing, radius } from "@/src/theme";

export default function EventHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["event-dashboard", id],
    queryFn: () => api<EventDashboard>(`/event/dashboard?evenement_id=${id}`, {}, token),
    enabled: !!token && !!id,
    refetchInterval: 8000,
  });

  const isPastoral = user?.role === "pasteur" || user?.role === "ouvrier";
  const activeSession = data?.active_session;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="hub-back" onPress={() => router.push("/(app)/evenements")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>UDAMG</Text>
          <Text style={styles.title} numberOfLines={1}>{titre || "Événement"}</Text>
        </View>
        <View style={activeSession ? styles.pillOn : styles.pillOff}>
          <Text style={activeSession ? styles.pillOnTxt : styles.pillOffTxt}>
            {activeSession ? "● Live" : "○ Off"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
        {/* Session banner */}
        <View style={[styles.sessionCard, activeSession ? styles.sessionOn : styles.sessionOff]}>
          <View style={styles.sessionRow}>
            <Text style={styles.sessionEmoji}>{activeSession ? "🕐" : "⏸"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionLbl}>SÉANCE</Text>
              <Text style={styles.sessionVal}>
                {activeSession ? `${activeSession.nom} · ouverte` : "Aucune séance ouverte"}
              </Text>
            </View>
          </View>
          {!activeSession && (
            <Text style={styles.sessionHint}>Le Pasteur doit ouvrir une séance pour débloquer le pointage.</Text>
          )}
        </View>

        {/* Quick KPI */}
        {isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : (
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiNum}>{data?.total ?? 0}</Text>
              <Text style={styles.kpiLbl}>Inscrits</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={[styles.kpiNum, { color: colors.success }]}>{data?.pointages_active_session ?? 0}</Text>
              <Text style={styles.kpiLbl}>Pointés</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={[styles.kpiNum, { color: "#F59E0B" }]}>{data?.enfants_active_session ?? 0}</Text>
              <Text style={styles.kpiLbl}>Enfants</Text>
            </View>
          </View>
        )}

        {/* 3 primary actions */}
        <Pressable
          testID="hub-scanner"
          onPress={() => router.push(`/(app)/event/${id}/scanner?titre=${encodeURIComponent(titre || "")}`)}
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: "#6366F1" }, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.primaryIcon}><Text style={styles.primaryIconTxt}>▦</Text></View>
          <Text style={styles.primaryLbl}>Ouvrir le Pointage</Text>
        </Pressable>

        <Pressable
          testID="hub-inscrits"
          onPress={() => router.push(`/(app)/event/${id}/inscrits?titre=${encodeURIComponent(titre || "")}`)}
          style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.primaryIcon, { backgroundColor: colors.brandTertiary }]}>
            <Text style={[styles.primaryIconTxt, { color: colors.brandPrimary }]}>👥</Text>
          </View>
          <Text style={styles.outlineLbl}>Gestion des Inscrits</Text>
        </Pressable>

        {isPastoral && (
          <Pressable
            testID="hub-pasteur"
            onPress={() => router.push(`/(app)/event/${id}/pasteur?titre=${encodeURIComponent(titre || "")}`)}
            style={({ pressed }) => [styles.darkBtn, pressed && { opacity: 0.9 }]}
          >
            <View style={[styles.primaryIcon, { backgroundColor: "#FEF3C7" }]}>
              <Text style={styles.primaryIconTxt}>📊</Text>
            </View>
            <Text style={styles.darkLbl}>Espace Pasteur <Text style={styles.darkSub}>(Dashboard)</Text></Text>
          </Pressable>
        )}

        {/* Secondary actions */}
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text style={styles.sectionLbl}>Outils</Text>
          <Pressable
            testID="hub-enfants"
            onPress={() => router.push(`/(app)/event/${id}/enfants?titre=${encodeURIComponent(titre || "")}`)}
            style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.miniEmoji}>🧒</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniTitle}>Comptage enfants</Text>
              <Text style={styles.miniSub}>Incrémenter · décrémenter</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
          <Pressable
            testID="hub-inscription"
            onPress={() => router.push(`/inscription?event=${id}&titre=${encodeURIComponent(titre || "")}`)}
            style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.miniEmoji}>🔗</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniTitle}>Lien d'inscription publique</Text>
              <Text style={styles.miniSub}>À partager avec le public</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  brand: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  pillOn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: colors.success },
  pillOnTxt: { color: colors.success, fontWeight: "800", fontSize: 11 },
  pillOff: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  pillOffTxt: { color: colors.muted, fontWeight: "800", fontSize: 11 },
  sessionCard: { padding: spacing.lg, borderRadius: radius.md, gap: 6 },
  sessionOn: { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: colors.success },
  sessionOff: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: colors.warning },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sessionEmoji: { fontSize: 26 },
  sessionLbl: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  sessionVal: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  sessionHint: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  kpiRow: { flexDirection: "row", gap: spacing.sm },
  kpi: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  kpiNum: { color: colors.brandPrimary, fontSize: 22, fontWeight: "900" },
  kpiLbl: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg, minHeight: 68,
    shadowColor: "#6366F1", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  primaryIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  primaryIconTxt: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  primaryLbl: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", flex: 1 },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg, minHeight: 68,
    borderWidth: 2, borderColor: colors.brandPrimary, backgroundColor: colors.surface,
  },
  outlineLbl: { color: colors.brandPrimary, fontSize: 17, fontWeight: "800", flex: 1 },
  darkBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg, minHeight: 68,
    backgroundColor: colors.surfaceInverse,
  },
  darkLbl: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", flex: 1 },
  darkSub: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  sectionLbl: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  miniBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  miniEmoji: { fontSize: 22 },
  miniTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  miniSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chev: { color: colors.brandPrimary, fontSize: 20, fontWeight: "800" },
});
