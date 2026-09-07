import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

export default function ContextMenu() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { type, id, nom } = useLocalSearchParams<{ type: "ville" | "programme"; id: string; nom?: string }>();

  const canSeeAll = user?.role === "pasteur" || user?.role === "ouvrier";
  const isGlobal = id === "GLOBAL";

  const goCategories = () => router.push(`/(app)/context/${type}/${id}/categories?nom=${encodeURIComponent(nom || "")}`);
  const goList = () => router.push(`/(app)/context/${type}/${id}/liste?nom=${encodeURIComponent(nom || "")}`);
  const goStats = () => router.push(`/(app)/context/${type}/${id}/stats?nom=${encodeURIComponent(nom || "")}`);
  const goAnciens = () => router.push(`/(app)/context/${type}/${id}/anciens?nom=${encodeURIComponent(nom || "")}`);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="context-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{type === "ville" ? "ÉGLISE" : "PROGRAMME"}</Text>
          <Text style={styles.title} numberOfLines={1}>{nom || "Contexte"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
        <Text style={styles.subtitle}>Que voulez-vous faire ?</Text>

        {!isGlobal && (
          <Pressable
            testID="ctx-new-contact"
            onPress={() => router.push(`/(app)/context/${type}/${id}/liste?nom=${encodeURIComponent(nom || "")}&openNew=1`)}
            style={[styles.btn, { backgroundColor: colors.success }]}
          >
            <Text style={styles.btnEmoji}>➕</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.btnTitle}>Nouveau Contact</Text>
              <Text style={styles.btnSub}>Ajouter une âme rapidement</Text>
            </View>
          </Pressable>
        )}

        <Pressable
          testID="ctx-list-souls"
          onPress={goCategories}
          style={[styles.btn, { backgroundColor: colors.brandSecondary }]}
        >
          <Text style={styles.btnEmoji}>👥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.btnTitle}>Liste des Âmes</Text>
            <Text style={styles.btnSub}>Par catégorie ou toutes</Text>
          </View>
        </Pressable>

        <Pressable
          testID="ctx-dashboard"
          onPress={goStats}
          style={[styles.btn, { backgroundColor: "#D4A017" }]}
        >
          <Text style={styles.btnEmoji}>📊</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.btnTitle}>Tableau de bord (Stats)</Text>
            <Text style={styles.btnSub}>Relancés · Présentés · Invités</Text>
          </View>
        </Pressable>

        {canSeeAll && (
          <Pressable
            testID="ctx-anciens"
            onPress={goAnciens}
            style={[styles.btn, { backgroundColor: colors.muted }]}
          >
            <Text style={styles.btnEmoji}>📚</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.btnTitle}>Liste des Anciens</Text>
              <Text style={styles.btnSub}>Contacts archivés</Text>
            </View>
          </Pressable>
        )}

        {isGlobal && (
          <Pressable
            testID="ctx-quick-list"
            onPress={goList}
            style={[styles.btn, { backgroundColor: colors.brandPrimary }]}
          >
            <Text style={styles.btnEmoji}>🌍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.btnTitle}>Toutes les âmes (Bilan Global)</Text>
              <Text style={styles.btnSub}>Vue toutes églises</Text>
            </View>
          </Pressable>
        )}
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
  subtitle: { color: colors.muted, marginBottom: spacing.md, fontStyle: "italic" },
  btn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.xl, borderRadius: radius.lg,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  btnEmoji: { fontSize: 32 },
  btnTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  btnSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
});
