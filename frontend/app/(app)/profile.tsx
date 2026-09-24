import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, roleLabel } from "@/src/api";
import { canReadRestrictedMedia, canSendMessages, canWriteMedia, canManageUsers, canManageEvents } from "@/src/roles";
import { useToast } from "@/src/toast";
import { colors, spacing, radius } from "@/src/theme";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show: toast } = useToast();
  const { user, token, logout } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");

  const change = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", body: JSON.stringify({ current_password: cur, new_password: next }) }, token),
    onSuccess: () => { toast("Mot de passe modifié ✓"); setCur(""); setNext(""); },
    onError: (e: any) => toast(e?.message || "Erreur"),
  });

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const rights = [
    { ok: true, label: "Media : écoute des contenus" },
    { ok: canReadRestrictedMedia(user?.role), label: "Media : Réunion Pasteur / Conseil élargi" },
    { ok: canWriteMedia(user?.role), label: "Media : ajout / modification de contenu" },
    { ok: canSendMessages(user?.role), label: "Messagerie : envoi de messages" },
    { ok: canManageEvents(user?.role), label: "Événements : création & gestion" },
    { ok: canManageUsers(user?.role), label: "Gestion des utilisateurs" },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="profile-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={8}><Text style={styles.backTxt}>‹</Text></Pressable>
        <Text style={styles.title}>Mon profil</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(user?.prenom?.[0] || "") + (user?.nom?.[0] || "")}</Text></View>
          <Text style={styles.name} testID="profile-name">{user?.prenom} {user?.nom}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.pill}><Text style={styles.pillTxt} testID="profile-role">{user ? roleLabel(user.role).toUpperCase() : ""}</Text></View>
        </View>

        <Text style={styles.section}>Mes droits d&apos;accès</Text>
        <View style={styles.box}>
          {rights.map((r) => (
            <View key={r.label} style={styles.right}>
              <Text style={[styles.rightIcon, { color: r.ok ? colors.success : colors.muted }]}>{r.ok ? "✓" : "—"}</Text>
              <Text style={[styles.rightTxt, !r.ok && { color: colors.muted }]}>{r.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Changer mon mot de passe</Text>
        <View style={styles.box}>
          <TextInput testID="pwd-current" value={cur} onChangeText={setCur} secureTextEntry placeholder="Mot de passe actuel" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput testID="pwd-new" value={next} onChangeText={setNext} secureTextEntry placeholder="Nouveau mot de passe (min. 6)" placeholderTextColor={colors.muted} style={styles.input} />
          <Pressable testID="pwd-save" disabled={!cur || next.length < 6 || change.isPending} onPress={() => change.mutate()} style={({ pressed }) => [styles.cta, (!cur || next.length < 6 || pressed) && { opacity: 0.7 }]}>
            {change.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaTxt}>Mettre à jour</Text>}
          </Pressable>
        </View>

        <Pressable testID="profile-logout" onPress={onLogout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.8 }]}>
          <Text style={styles.logoutTxt}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, lineHeight: 30 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.md },
  card: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  avatarTxt: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: 28 },
  name: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  email: { color: colors.muted },
  pill: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginTop: spacing.sm },
  pillTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  section: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.sm },
  box: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  right: { flexDirection: "row", gap: spacing.md, alignItems: "center", minHeight: 32 },
  rightIcon: { fontWeight: "800", width: 18, textAlign: "center" },
  rightTxt: { color: colors.onSurface, flex: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 50, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 15 },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, minHeight: 48, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "800" },
  logout: { marginTop: spacing.lg, minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },
  logoutTxt: { color: colors.error, fontWeight: "800" },
});
