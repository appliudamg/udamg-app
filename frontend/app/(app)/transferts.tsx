import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type TransfertEntry = {
  id: string;
  contact_id: string;
  contact_nom: string;
  from: { type?: string; id?: string; nom?: string };
  to: { type?: string; id?: string; nom?: string };
  by: string;
  timestamp: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Transferts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [q, setQ] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["transferts", q],
    queryFn: () => api<TransfertEntry[]>(`/transferts${q ? `?q=${encodeURIComponent(q)}` : ""}`, {}, token),
    enabled: !!token,
  });

  const items = data ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="transferts-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ADMINISTRATION</Text>
          <Text style={styles.title}>Journal des transferts</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="transferts-search"
          placeholder="Rechercher (contact, église, responsable)"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      </View>

      <Text style={styles.summary}>
        <Text style={styles.summaryNum}>{items.length}</Text> transfert{items.length > 1 ? "s" : ""}
      </Text>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTxt}>Aucun transfert enregistré</Text>
              <Text style={styles.emptySub}>Les mouvements inter-églises apparaîtront ici</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`transfert-${item.id}`}>
              <Text style={styles.contact}>{item.contact_nom}</Text>
              <View style={styles.flow}>
                <View style={styles.tag}>
                  <Text style={styles.tagLabel}>DE</Text>
                  <Text style={styles.tagTxt} numberOfLines={1}>{item.from?.nom || "?"}</Text>
                </View>
                <Text style={styles.arrow}>→</Text>
                <View style={[styles.tag, styles.tagTo]}>
                  <Text style={[styles.tagLabel, { color: colors.onBrandPrimary }]}>VERS</Text>
                  <Text style={[styles.tagTxt, { color: colors.onBrandPrimary }]} numberOfLines={1}>{item.to?.nom || "?"}</Text>
                </View>
              </View>
              <View style={styles.meta}>
                <Text style={styles.metaTxt}>🕐 {formatDate(item.timestamp)}</Text>
                <Text style={styles.metaTxt}>👤 Par {item.by}</Text>
              </View>
            </View>
          )}
        />
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
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  searchWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  search: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.border, color: colors.onSurface, minHeight: 48,
  },
  summary: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, color: colors.muted, fontSize: 14 },
  summaryNum: { color: colors.brandPrimary, fontWeight: "800", fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 16 },
  emptySub: { color: colors.muted, fontSize: 13, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  contact: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  flow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tag: {
    flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: 2,
  },
  tagTo: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tagLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  tagTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  arrow: { color: colors.brandPrimary, fontSize: 20, fontWeight: "800" },
  meta: { gap: 4 },
  metaTxt: { color: colors.muted, fontSize: 12 },
});
