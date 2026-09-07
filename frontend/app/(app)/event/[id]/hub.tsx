import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
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

  const { data } = useQuery({
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
          <Text style={styles.eyebrow}>ÉMARGEMENT</Text>
          <Text style={styles.title} numberOfLines={1}>{titre || "Événement"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
        <View style={[styles.sessionBanner, activeSession ? styles.sessionOn : styles.sessionOff]}>
          <Text style={styles.sessionLbl}>SÉANCE</Text>
          <Text style={styles.sessionVal}>{activeSession ? `● ${activeSession.nom}` : "○ Aucune séance active"}</Text>
          {!activeSession && (
            <Text style={styles.sessionHint}>Le Pasteur doit démarrer une séance pour activer le scanner.</Text>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{data?.total ?? 0}</Text>
            <Text style={styles.statLbl}>Inscrits</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{data?.pointages_active_session ?? 0}</Text>
            <Text style={styles.statLbl}>Pointés</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{data?.enfants_active_session ?? 0}</Text>
            <Text style={styles.statLbl}>Enfants</Text>
          </View>
        </View>

        <Pressable
          testID="hub-scanner"
          onPress={() => router.push(`/(app)/event/${id}/scanner?titre=${encodeURIComponent(titre || "")}`)}
          style={[styles.action, { backgroundColor: colors.brandPrimary }]}
        >
          <Text style={styles.actionEmoji}>📷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Scanner de pointage</Text>
            <Text style={styles.actionSub}>Scannez les badges QR</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable
          testID="hub-inscrits"
          onPress={() => router.push(`/(app)/event/${id}/inscrits?titre=${encodeURIComponent(titre || "")}`)}
          style={[styles.action, { backgroundColor: colors.brandSecondary }]}
        >
          <Text style={styles.actionEmoji}>👥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Gestion des inscrits</Text>
            <Text style={styles.actionSub}>Annuaire, ajout, badges EBED-XXXX</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable
          testID="hub-enfants"
          onPress={() => router.push(`/(app)/event/${id}/enfants?titre=${encodeURIComponent(titre || "")}`)}
          style={[styles.action, { backgroundColor: "#F59E0B" }]}
        >
          <Text style={styles.actionEmoji}>🧒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Comptage enfants</Text>
            <Text style={styles.actionSub}>Incrémenter / décrémenter</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        {isPastoral && (
          <Pressable
            testID="hub-pasteur"
            onPress={() => router.push(`/(app)/event/${id}/pasteur?titre=${encodeURIComponent(titre || "")}`)}
            style={[styles.action, { backgroundColor: "#D4A017" }]}
          >
            <Text style={styles.actionEmoji}>⛪</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Espace Pasteur</Text>
              <Text style={styles.actionSub}>Séances · Dashboard · Rapports</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}

        <Pressable
          testID="hub-inscription"
          onPress={() => router.push(`/inscription?event=${id}&titre=${encodeURIComponent(titre || "")}`)}
          style={[styles.action, { backgroundColor: colors.surfaceInverse }]}
        >
          <Text style={styles.actionEmoji}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Inscription publique</Text>
            <Text style={styles.actionSub}>Formulaire à partager avec le public</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sessionBanner: { padding: spacing.lg, borderRadius: radius.md, gap: 4 },
  sessionOn: { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: colors.success },
  sessionOff: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: colors.warning },
  sessionLbl: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  sessionVal: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  sessionHint: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brandPrimary, fontSize: 22, fontWeight: "900" },
  statLbl: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  action: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  actionEmoji: { fontSize: 30 },
  actionTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  actionSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  chev: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
});
