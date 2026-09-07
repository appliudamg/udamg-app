import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Evenement, eventTypeLabel } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EvenementsList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["evenements"],
    queryFn: () => api<Evenement[]>("/evenements", {}, token),
    enabled: !!token,
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="evenements-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PÔLE 2 · Vie d'Église</Text>
          <Text style={styles.title}>Événements</Text>
        </View>
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
                onPress={() => router.push(`/(app)/evenements/${item.id}`)}
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
                </View>
              </Pressable>
            );
          }}
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
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  card: {
    flexDirection: "row", gap: spacing.md, alignItems: "flex-start",
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  datePill: {
    width: 62, paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  dateDay: { color: colors.onBrandPrimary, fontSize: 22, fontWeight: "800" },
  dateMonth: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  typeTag: {
    alignSelf: "flex-start", backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "700",
    marginBottom: spacing.xs,
  },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  error: { color: colors.error },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md },
  retryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
