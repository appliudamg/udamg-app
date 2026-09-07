import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Contact, niveauColor } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Anciens() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { type, id, nom } = useLocalSearchParams<{ type: string; id: string; nom?: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["anciens", type, id],
    queryFn: () => api<Contact[]>(`/anciens?context_type=${type}&context_id=${id}`, {}, token),
    enabled: !!token && !!id && !!type,
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="anciens-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{nom || ""}</Text>
          <Text style={styles.title}>Anciens (archivés)</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty} testID="anciens-empty">Aucun ancien archivé</Text>}
          renderItem={({ item }) => {
            const nv = niveauColor(item.niveau);
            return (
              <View style={styles.card} testID={`ancien-card-${item.id}`}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.nom} {item.prenom}</Text>
                  <View style={[styles.pill, { backgroundColor: nv.bg }]}>
                    <Text style={styles.pillTxt}>Niv {item.niveau}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>📁 Archivé · {item.categorie}</Text>
                {!!item.tel && <Text style={styles.meta}>📞 {item.tel}</Text>}
                <Text style={styles.meta}>Référent : {item.referent}</Text>
              </View>
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
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "space-between" },
  name: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillTxt: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
