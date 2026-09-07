import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("admin@udamg.app");
  const [password, setPassword] = useState("AdminUdamg2026!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  footerText: { color: colors.muted },
  footerLink: { color: colors.brandPrimary, fontWeight: "600" },
});
