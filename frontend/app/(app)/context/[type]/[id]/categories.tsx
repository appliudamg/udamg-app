import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

const ICONS: Record<string, string> = {
  "GÉDÉON": "⚔️",
  "Mission JAC": "🌟",
  "CCMG": "⛪",
};

export default function Categories() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { type, id, nom } = useLocalSearchParams<{ type: string; id: string; nom?: string }>();

  const go = (categorie?: string) => {
    const q = new URLSearchParams({ nom: nom || "" });
    if (categorie) q.append("categorie", categorie);
    router.push(`/(app)/context/${type}/${id}/liste?${q.toString()}`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="categories-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{nom}</Text>
          <Text style={styles.title}>Choisissez une catégorie</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
        {CATEGORIES.map(cat => (
          <Pressable
            key={cat}
            testID={`cat-${cat}`}
            onPress={() => go(cat)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.icon}>{ICONS[cat]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{cat}</Text>
              <Text style={styles.cardSub}>Voir les âmes de cette catégorie</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
        <Pressable
          testID="cat-all"
          onPress={() => go()}
          style={({ pressed }) => [styles.cardAll, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.icon}>🌍</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.onBrandPrimary }]}>Toutes les âmes</Text>
            <Text style={[styles.cardSub, { color: "rgba(255,255,255,0.85)" }]}>Vue complète du contexte</Text>
          </View>
          <Text style={[styles.chev, { color: colors.onBrandPrimary }]}>›</Text>
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
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardAll: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  icon: { fontSize: 28 },
  cardTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chev: { color: colors.brandPrimary, fontSize: 24, fontWeight: "700" },
});
