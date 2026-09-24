import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, Clipboard as RNClipboard,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

export default function Login() {
  const { login, loginWithGoogle, denied, clearDenied } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("admin@udamg.app");
  const [password, setPassword] = useState("AdminUdamg2026!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const onSubmit = async () => {
    setError("");
    if (!email || !password) {
      setError("Email et mot de passe requis");
      return;
    }
    try {
      setLoading(true);
      await login(email.trim(), password);
      router.replace("/(app)/menu");
    } catch (e: any) {
      setError(e?.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError("");
    try {
      setGLoading(true);
      await loginWithGoogle();
      router.replace("/(app)/menu");
    } catch (e: any) {
      setError(e?.message || "Connexion Google échouée");
    } finally {
      setGLoading(false);
    }
  };

  const copyEmail = async () => {
    if (!denied?.email) return;
    try {
      await Clipboard.setStringAsync(denied.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      try { (RNClipboard as any).setString?.(denied.email); } catch {}
    }
  };

  // Access-denied screen (Google login for non-approved emails)
  if (denied) {
    return (
      <View style={[deniedStyles.root, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={deniedStyles.iconWrap}><Text style={deniedStyles.icon}>🔒</Text></View>
        <Text style={deniedStyles.title}>Accès refusé</Text>
        <Text style={deniedStyles.msg}>{denied.message}</Text>
        {!!denied.email && (
          <View style={deniedStyles.emailBox}>
            <Text style={deniedStyles.emailLabel}>Votre email</Text>
            <Text testID="denied-email" style={deniedStyles.emailValue} selectable>{denied.email}</Text>
            <Pressable testID="denied-copy" onPress={copyEmail} style={deniedStyles.copyBtn}>
              <Text style={deniedStyles.copyTxt}>{copied ? "✓ Copié" : "Copier l'email"}</Text>
            </Pressable>
          </View>
        )}
        <Text style={deniedStyles.hint}>
          Transmettez cet email à un responsable / pasteur pour être ajouté à l&apos;équipe UDAMG.
        </Text>
        <Pressable testID="denied-back" onPress={clearDenied} style={deniedStyles.backBtn}>
          <Text style={deniedStyles.backTxt}>Réessayer avec un autre compte</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand} testID="login-brand">UDAMG</Text>
          <Text style={styles.slogan}>Sauvé par Grâce pour Sauver</Text>
        </View>

        <Text style={styles.title}>Bienvenue</Text>
        <Text style={styles.subtitle}>Connectez-vous pour continuer</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="votre@email.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            testID="login-password-input"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        {!!error && (
          <Text style={styles.error} testID="login-error">{error}</Text>
        )}

        <Pressable
          testID="login-submit-button"
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.cta, (pressed || loading) && { opacity: 0.85 }]}
        >
          {loading ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.ctaLabel}>Se Connecter</Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerTxt}>OU</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          testID="login-google-button"
          onPress={onGoogle}
          disabled={gLoading}
          style={({ pressed }) => [styles.gCta, (pressed || gLoading) && { opacity: 0.85 }]}
        >
          {gLoading ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : (
            <>
              <Text style={styles.gIcon}>G</Text>
              <Text style={styles.gLabel}>Continuer avec Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas encore de compte ? </Text>
          <Link href="/register" testID="login-go-register">
            <Text style={styles.footerLink}>Créer un compte</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.md },
  header: { alignItems: "center", marginBottom: spacing.xxl, gap: spacing.xs },
  brand: { fontSize: 36, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 2 },
  slogan: { color: colors.muted, fontStyle: "italic" },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 16,
    minHeight: 52,
  },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.xs },
  cta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center", justifyContent: "center",
    marginTop: spacing.lg, minHeight: 54,
  },
  ctaLabel: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  gCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md,
    backgroundColor: "#FFFFFF", borderRadius: radius.md, paddingVertical: spacing.lg,
    borderWidth: 1.5, borderColor: colors.border, minHeight: 54,
  },
  gIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#4285F4", color: "#FFFFFF",
    textAlign: "center", lineHeight: 24, fontWeight: "800", fontSize: 14,
    overflow: "hidden",
  },
  gLabel: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  footerText: { color: colors.muted },
  footerLink: { color: colors.brandPrimary, fontWeight: "600" },
});

const deniedStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center" },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg, marginTop: spacing.xl },
  icon: { fontSize: 48 },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md, textAlign: "center" },
  msg: { fontSize: 15, color: colors.muted, textAlign: "center", lineHeight: 22, marginBottom: spacing.xl, paddingHorizontal: spacing.md },
  emailBox: { width: "100%", backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  emailLabel: { fontSize: 11, color: colors.muted, fontWeight: "700", letterSpacing: 1 },
  emailValue: { fontSize: 15, color: colors.onSurface, fontWeight: "700" },
  copyBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, minWidth: 160, alignItems: "center" },
  copyTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  hint: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 20, marginBottom: spacing.xl, paddingHorizontal: spacing.md },
  backBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, minHeight: 48, alignItems: "center", justifyContent: "center" },
  backTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
});

