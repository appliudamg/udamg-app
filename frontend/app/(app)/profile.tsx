import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Stats, roleLabel } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, token } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<Stats>("/stats", {}, token),
    enabled: !!token,
  });

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="profile-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Profil</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{user?.prenom?.[0]}{user?.nom?.[0]}</Text>
          </View>
          <Text style={styles.name} testID="profile-name">{user?.prenom} {user?.nom}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.roleBadge}>{user ? roleLabel(user.role).toUpperCase() : ""}</Text>
        </View>

        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.my_contacts}</Text>
              <Text style={styles.statLbl}>Mes contacts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.total_contacts}</Text>
              <Text style={styles.statLbl}>Total contacts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.total_evenements}</Text>
              <Text style={styles.statLbl}>Événements</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.total_villes}</Text>
              <Text style={styles.statLbl}>Églises</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.total_programmes}</Text>
              <Text style={styles.statLbl}>Programmes</Text>
            </View>
          </View>
        )}

        {!stats && <ActivityIndicator color={colors.brandPrimary} />}

        <Pressable
          testID="profile-logout-button"
          onPress={onLogout}
          style={({ pressed }) => [styles.logout, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.logoutTxt}>Se déconnecter</Text>
        </Pressable>

        <Text style={styles.footer}>UDAMG APP · Sauvé par Grâce pour Sauver</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  avatarWrap: { alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  avatar: { width: 96, height: 96, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary },
  avatarTxt: { color: colors.brandPrimary, fontSize: 32, fontWeight: "800" },
  name: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: spacing.sm },
  email: { color: colors.muted, fontSize: 14 },
  roleBadge: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, fontSize: 11, fontWeight: "800", overflow: "hidden", marginTop: spacing.xs },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 28, fontWeight: "800", color: colors.brandPrimary },
  statLbl: { fontSize: 12, color: colors.muted, marginTop: 4 },
  logout: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.error, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  logoutTxt: { color: colors.error, fontWeight: "700", fontSize: 16 },
  footer: { textAlign: "center", color: colors.muted, fontSize: 12, fontStyle: "italic", marginTop: spacing.xl },
});
