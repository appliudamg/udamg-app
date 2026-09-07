import { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Ville, normalize } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Villes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const [q, setQ] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["villes"],
    queryFn: () => api<Ville[]>("/villes", {}, token),
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = normalize(q.trim());
    if (!s) return data;
    return data.filter(v => normalize(v.nom).includes(s) || v.code_postal.includes(s));
  }, [data, q]);

  const isPasteur = user?.role === "pasteur";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="villes-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MISSION</Text>
          <Text style={styles.title}>Églises de France</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="villes-search-input"
          placeholder="Rechercher une église"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errTxt}>Erreur de chargement</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryTxt}>Réessayer</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(v) => v.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListHeaderComponent={
            isPasteur ? (
              <Pressable
                testID="villes-global"
                onPress={() => router.push(`/(app)/context/ville/GLOBAL?nom=${encodeURIComponent("Bilan Global")}`)}
                style={styles.globalBtn}
              >
                <Text style={styles.globalTxt}>📊 Bilan Global (toutes les églises)</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Aucune église trouvée</Text>}
          renderItem={({ item }) => (
            <Pressable
              testID={`ville-card-${item.id}`}
              onPress={() => router.push(`/(app)/context/ville/${item.id}?nom=${encodeURIComponent(item.nom)}`)}
              style={({ pressed }) => [styles.gridCard, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.gridBadge}><Text style={styles.gridBadgeTxt}>{item.nom.replace("CCMG ", "").slice(0, 2).toUpperCase()}</Text></View>
              <Text style={styles.gridTitle} numberOfLines={2}>{item.nom}</Text>
              <Text style={styles.gridSub}>{item.code_postal}</Text>
            </Pressable>
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
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  searchWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  search: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, minHeight: 48,
  },
  gridCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, minHeight: 130,
  },
  gridBadge: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  gridBadgeTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  gridTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  gridSub: { color: colors.muted, fontSize: 12 },
  globalBtn: {
    backgroundColor: colors.brandPrimary, padding: spacing.lg, borderRadius: radius.md,
    marginBottom: spacing.md, alignItems: "center",
  },
  globalTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl, flex: 1 },
  errTxt: { color: colors.error },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md },
  retryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
