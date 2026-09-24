import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { api, roleLabel } from "@/src/api";
import { canManageUsers } from "@/src/roles";
import { colors, spacing, radius } from "@/src/theme";

const EVENTS_IMG = "https://images.unsplash.com/photo-1570786032462-2efc3ca8fccd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwyfHxjaHVyY2glMjB3b3JzaGlwJTIwZ2F0aGVyaW5nfGVufDB8fHx8MTc4ODY1MTAxOHww&ixlib=rb-4.1.0&q=85";
const MEDIA_IMG = "https://images.unsplash.com/photo-1478147427282-58a87a120781?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80";

export default function MenuPrincipal() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();

  const unread = useQuery({
    queryKey: ["messages", "unread"],
    queryFn: () => api<{ unread: number }>("/messages/unread-count", {}, token),
    enabled: !!token,
    refetchInterval: 15000,
  });
  const unreadCount = unread.data?.unread ?? 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Bonjour {user?.prenom}</Text>
          <Text style={styles.title}>UDAMG APP</Text>
          {!!user && <Text style={styles.role}>{roleLabel(user.role)}</Text>}
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

        {canManageUsers(user?.role) && (
          <Pressable
            testID="menu-team-card"
            onPress={() => router.push("/(app)/users")}
            style={({ pressed }) => [styles.teamCard, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.teamIcon}>👥</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.teamTitle}>Équipe & Utilisateurs</Text>
              <Text style={styles.teamSub}>Ajouter · Modifier · Attribuer un rôle</Text>
            </View>
            <Text style={styles.teamChev}>›</Text>
          </Pressable>
        )}

        <Text style={styles.section}>Espace Événements</Text>
        <Pressable
          testID="menu-evenements-card"
          onPress={() => router.push("/(app)/evenements")}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        >
          <ImageBackground source={{ uri: EVENTS_IMG }} style={styles.cardBg} imageStyle={styles.cardImage}>
            <LinearGradient colors={["rgba(0,71,171,0.55)", "rgba(15,23,42,0.85)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardEyebrow}>1.1</Text>
              <Text style={styles.cardTitle} adjustsFontSizeToFit numberOfLines={1}>Événements</Text>
              <Text style={styles.cardSubtitle}>Création · Inscrits · Badges QR · Pointage</Text>
            </View>
          </ImageBackground>
        </Pressable>

        <Pressable
          testID="menu-messages-card"
          onPress={() => router.push("/(app)/messages")}
          style={({ pressed }) => [styles.teamCard, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.teamIcon}>📣</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamTitle}>1.2 · Messagerie</Text>
            <Text style={styles.teamSub}>Annonces de l&apos;Admin et de l&apos;Équipe technique</Text>
          </View>
          {unreadCount > 0 ? (
            <View style={styles.badge} testID="menu-messages-badge">
              <Text style={styles.badgeTxt}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          ) : (
            <Text style={styles.teamChev}>›</Text>
          )}
        </Pressable>

        <Text style={styles.section}>Media</Text>
        <Pressable
          testID="menu-media-card"
          onPress={() => router.push("/(app)/media")}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        >
          <ImageBackground source={{ uri: MEDIA_IMG }} style={styles.cardBg} imageStyle={styles.cardImage}>
            <LinearGradient colors={["rgba(76,29,149,0.45)", "rgba(11,11,18,0.9)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardEyebrow}>AUDIOS & VIDÉOS</Text>
              <Text style={styles.cardTitle} adjustsFontSizeToFit numberOfLines={1}>Media</Text>
              <Text style={styles.cardSubtitle}>Cultes · Programmes · Enseignements · Podcasts · Story</Text>
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
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  hello: { color: colors.muted, fontSize: 13 },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800", marginTop: 2 },
  role: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 14 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  slogan: { color: colors.muted, fontStyle: "italic", textAlign: "center", marginBottom: spacing.sm },
  section: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: spacing.sm, textTransform: "uppercase" },
  card: {
    height: 190, borderRadius: radius.lg, overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    boxShadow: "0px 4px 12px rgba(0,0,0,0.08)",
  },
  cardBg: { flex: 1, justifyContent: "flex-end" },
  cardImage: { borderRadius: radius.lg },
  cardOverlay: { padding: spacing.xl, gap: spacing.xs },
  cardEyebrow: { color: "#EFF6FF", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  cardTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  cardSubtitle: { color: "#E2E8F0", fontSize: 13 },
  teamCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, minHeight: 64,
  },
  teamIcon: { fontSize: 28 },
  teamTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  teamSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  teamChev: { color: colors.muted, fontSize: 22 },
  badge: {
    minWidth: 26, height: 26, borderRadius: radius.pill, paddingHorizontal: 8,
    backgroundColor: colors.error, alignItems: "center", justifyContent: "center",
  },
  badgeTxt: { color: colors.onError, fontWeight: "800", fontSize: 12 },
});
