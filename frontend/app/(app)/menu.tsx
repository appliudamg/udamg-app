import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

const EVANG_IMG = "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNDR8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBncm91cCUyMG1lZXRpbmclMjBmcmllbmRzfGVufDB8fHx8MTc4ODY1MTAxOHww&ixlib=rb-4.1.0&q=85";
const EVENTS_IMG = "https://images.unsplash.com/photo-1570786032462-2efc3ca8fccd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwyfHxjaHVyY2glMjB3b3JzaGlwJTIwZ2F0aGVyaW5nfGVufDB8fHx8MTc4ODY1MTAxOHww&ixlib=rb-4.1.0&q=85";

export default function MenuPrincipal() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Bonjour {user?.prenom}</Text>
          <Text style={styles.title}>Menu Principal</Text>
        </View>
        <Pressable
          testID="menu-profile-button"
          onPress={() => router.push("/(app)/profile")}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>
            {(user?.prenom?.[0] || "") + (user?.nom?.[0] || "")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.slogan}>« Sauvé par Grâce pour Sauver »</Text>

        <Pressable
          testID="menu-evangelisation-card"
          onPress={() => router.push("/(app)/evangelisation")}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        >
          <ImageBackground source={{ uri: EVANG_IMG }} style={styles.cardBg} imageStyle={styles.cardImage}>
            <LinearGradient
              colors={["rgba(0,71,171,0.55)", "rgba(15,23,42,0.85)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardEyebrow}>PÔLE 1</Text>
              <Text style={styles.cardTitle}>Évangélisation</Text>
              <Text style={styles.cardSubtitle}>
                Villes · Familles spirituelles · Contacts
              </Text>
            </View>
          </ImageBackground>
        </Pressable>

        <Pressable
          testID="menu-evenements-card"
          onPress={() => router.push("/(app)/evenements")}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        >
          <ImageBackground source={{ uri: EVENTS_IMG }} style={styles.cardBg} imageStyle={styles.cardImage}>
            <LinearGradient
              colors={["rgba(0,71,171,0.55)", "rgba(15,23,42,0.85)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardEyebrow}>PÔLE 2</Text>
              <Text style={styles.cardTitle}>Événements</Text>
              <Text style={styles.cardSubtitle}>
                Programmes · Invitations · Coordination
              </Text>
            </View>
          </ImageBackground>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { color: colors.muted, fontSize: 13 },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800", marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 14 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },
  slogan: { color: colors.muted, fontStyle: "italic", textAlign: "center", marginBottom: spacing.md },
  card: {
    height: 220, borderRadius: radius.lg, overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardBg: { flex: 1, justifyContent: "flex-end" },
  cardImage: { borderRadius: radius.lg },
  cardOverlay: { padding: spacing.xl, gap: spacing.xs },
  cardEyebrow: { color: "#EFF6FF", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  cardTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  cardSubtitle: { color: "#E2E8F0", fontSize: 13 },
});
