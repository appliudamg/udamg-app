import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, ContactStats, Programme } from "@/src/api";
import { downloadExport } from "@/src/downloads";
import { colors, spacing, radius } from "@/src/theme";

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { type, id, nom } = useLocalSearchParams<{ type: string; id: string; nom?: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contact-stats", type, id],
    queryFn: () => api<ContactStats>(`/contacts/stats?context_type=${type}&context_id=${id}`, {}, token),
    enabled: !!token && !!id && !!type,
  });

  const { data: programmes } = useQuery({
    queryKey: ["programmes"],
    queryFn: () => api<Programme[]>("/programmes", {}, token),
    enabled: !!token && type === "programme",
  });

  const isEbed = type === "programme" && programmes?.find(p => p.id === id)?.is_ebed;

  const runExport = async (kind: "xlsx" | "pdf" | "pdf-lots") => {
    const path =
      kind === "xlsx" ? `/exports/contacts.xlsx?context_type=${type}&context_id=${id}` :
      kind === "pdf" ? `/exports/contacts.pdf?context_type=${type}&context_id=${id}` :
      `/exports/contacts-lots.pdf?context_type=${type}&context_id=${id}`;
    const ext = kind === "xlsx" ? "xlsx" : "pdf";
    const suffix = kind === "pdf-lots" ? "_lots10" : "";
    const filename = `UDAMG_contacts_${type}_${id}${suffix}.${ext}`;
    try {
      setBusy(kind);
      await downloadExport(path, filename, token);
      setToast("Export téléchargé ✓");
      setTimeout(() => setToast(""), 2200);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Export impossible");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="stats-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{nom || ""}</Text>
          <Text style={styles.title}>Tableau de bord</Text>
        </View>
      </View>

      {isLoading || !data ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
          <View style={styles.totalCard}>
            <Text style={styles.totalNum}>{data.total}</Text>
            <Text style={styles.totalLbl}>Âmes au total</Text>
          </View>

          <View style={styles.gridRow}>
            <Gauge label="Relancés" value={data.niveau_1_relances} total={data.total} color="#EF4444" testID="gauge-1" />
            <Gauge label="Présentés" value={data.niveau_2_presentes} total={data.total} color="#F59E0B" testID="gauge-2" />
          </View>
          <View style={styles.gridRow}>
            <Gauge label="Invités" value={data.niveau_3_invites} total={data.total} color="#10B981" testID="gauge-3" />
            <Gauge label="Disciples" value={data.niveau_4_disciples} total={data.total} color="#D4A017" testID="gauge-4" />
          </View>

          <View>
            <Text style={styles.sectionTitle}>Par catégorie</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {Object.entries(data.by_categorie).map(([cat, count]) => (
                <View key={cat} style={styles.catRow}>
                  <Text style={styles.catName}>{cat}</Text>
                  <Text style={styles.catCount}>{count}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>Rapports d'export</Text>
            <Pressable
              testID="export-excel"
              onPress={() => runExport("xlsx")}
              disabled={busy !== null}
              style={[styles.exportBtn, { backgroundColor: colors.success }, busy && { opacity: 0.6 }]}
            >
              {busy === "xlsx" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.exportTxt}>📊 Télécharger le Rapport Excel</Text>}
            </Pressable>
            <Pressable
              testID="export-pdf"
              onPress={() => runExport("pdf")}
              disabled={busy !== null}
              style={[styles.exportBtn, { backgroundColor: colors.error }, busy && { opacity: 0.6 }]}
            >
              {busy === "pdf" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.exportTxt}>📄 Télécharger le Rapport PDF</Text>}
            </Pressable>
            {isEbed && (
              <Pressable
                testID="export-pdf-lots"
                onPress={() => runExport("pdf-lots")}
                disabled={busy !== null}
                style={[styles.exportBtn, { backgroundColor: "#7C3AED" }, busy && { opacity: 0.6 }]}
              >
                {busy === "pdf-lots" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.exportTxt}>📚 Télécharger par lots de 10 (PDF)</Text>}
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}

      {!!toast && (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.xl }]} testID="stats-toast">
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function Gauge({ label, value, total, color, testID }: { label: string; value: number; total: number; color: string; testID: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={[styles.gaugeCard, { borderColor: color }]} testID={testID}>
      <View style={[styles.gaugeCircle, { borderColor: color }]}>
        <Text style={[styles.gaugeNum, { color }]}>{value}</Text>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
      <Text style={styles.gaugePct}>{pct}%</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  totalCard: { backgroundColor: colors.brandPrimary, padding: spacing.xl, borderRadius: radius.lg, alignItems: "center" },
  totalNum: { color: colors.onBrandPrimary, fontSize: 48, fontWeight: "900" },
  totalLbl: { color: colors.onBrandPrimary, fontSize: 14, marginTop: spacing.xs, opacity: 0.9 },
  gridRow: { flexDirection: "row", gap: spacing.md },
  gaugeCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 2, alignItems: "center", gap: spacing.xs },
  gaugeCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  gaugeNum: { fontSize: 24, fontWeight: "900" },
  gaugeLabel: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  gaugePct: { color: colors.muted, fontSize: 12 },
  sectionTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  catRow: { flexDirection: "row", justifyContent: "space-between", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  catName: { color: colors.onSurface, fontWeight: "600" },
  catCount: { color: colors.brandPrimary, fontWeight: "800", fontSize: 16 },
  exportBtn: { padding: spacing.lg, borderRadius: radius.md, alignItems: "center", minHeight: 50, justifyContent: "center" },
  exportTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  toast: {
    position: "absolute", left: spacing.lg, right: spacing.lg,
    backgroundColor: colors.surfaceInverse, padding: spacing.md, borderRadius: radius.md,
  },
  toastTxt: { color: colors.onSurfaceInverse, textAlign: "center", fontWeight: "700" },
});
