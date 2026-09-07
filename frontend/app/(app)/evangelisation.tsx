import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

const EGLISES_IMG = "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNDR8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBncm91cCUyMG1lZXRpbmclMjBmcmllbmRzfGVufDB8fHx8MTc4ODY1MTAxOHww&ixlib=rb-4.1.0&q=85";
const PROG_IMG = "https://images.unsplash.com/photo-1762967019514-232e7fc815a1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwzfHxtaW5pbWFsaXN0JTIwY2h1cmNoJTIwY3Jvc3MlMjBsaWdodHxlbnwwfHx8fDE3ODg2NTEwMTh8MA&ixlib=rb-4.1.0&q=85";

export default function Evangelisation() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const canSeeAll = user?.role === "pasteur" || user?.role === "ouvrier";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="evang-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PÔLE 1</Text>
          <Text style={styles.title}>Évangélisation</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Choisissez un contexte de mission</Text>

        <Pressable
          testID="evang-eglises-card"
          onPress={() => router.push("/(app)/villes")}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        >
          <ImageBackground source={{ uri: EGLISES_IMG }} style={styles.cardBg} imageStyle={styles.cardImage}>
            <LinearGradient colors={["rgba(0,71,171,0.55)", "rgba(15,23,42,0.85)"]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardEyebrow}>MISSION</Text>
              <Text style={styles.cardTitle}>Églises de France</Text>
              <Text style={styles.cardSubtitle}>CCMG Paris · Angers · Nantes · Lyon</Text>
            </View>
          </ImageBackground>
        </Pressable>

        <Pressable
          testID="evang-programmes-card"
          onPress={() => router.push("/(app)/programmes")}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        >
          <ImageBackground source={{ uri: PROG_IMG }} style={styles.cardBg} imageStyle={styles.cardImage}>
            <LinearGradient colors={["rgba(212,160,23,0.4)", "rgba(15,23,42,0.85)"]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardEyebrow}>✨ SPÉCIAL</Text>
              <Text style={styles.cardTitle}>Programmes Spéciaux</Text>
              <Text style={styles.cardSubtitle}>Convention EBED · Retraite · Rassemblements</Text>
            </View>
          </ImageBackground>
        </Pressable>

        <Text style={styles.sectionTitle}>Outils d'accompagnement</Text>

        <Pressable
          testID="evang-rappels-card"
          onPress={() => router.push("/(app)/rappels")}
          style={({ pressed }) => [styles.miniCard, pressed && { opacity: 0.9 }]}
        >
          <View style={[styles.miniIcon, { backgroundColor: "#EF4444" }]}>
            <Text style={styles.miniEmoji}>🔔</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniTitle}>Rappels automatiques</Text>
            <Text style={styles.miniSub}>Âmes stagnantes à relancer</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        {canSeeAll && (
          <Pressable
            testID="evang-transferts-card"
            onPress={() => router.push("/(app)/transferts")}
            style={({ pressed }) => [styles.miniCard, pressed && { opacity: 0.9 }]}
          >
            <View style={[styles.miniIcon, { backgroundColor: colors.warning }]}>
              <Text style={styles.miniEmoji}>🔀</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniTitle}>Journal des transferts</Text>
              <Text style={styles.miniSub}>Historique des déplacements</Text>
            </View>
            <Text style={styles.chev}>›</Text>
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
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },
  subtitle: { color: colors.muted, fontStyle: "italic", textAlign: "center", marginBottom: spacing.sm },
  card: {
    height: 180, borderRadius: radius.lg, overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardBg: { flex: 1, justifyContent: "flex-end" },
  cardImage: { borderRadius: radius.lg },
  cardOverlay: { padding: spacing.xl, gap: spacing.xs },
  cardEyebrow: { color: "#EFF6FF", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  cardTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  cardSubtitle: { color: "#E2E8F0", fontSize: 13 },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: spacing.md, marginBottom: 0 },
  miniCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  miniIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  miniEmoji: { fontSize: 20 },
  miniTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  miniSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chev: { color: colors.brandPrimary, fontSize: 24, fontWeight: "700" },
});
