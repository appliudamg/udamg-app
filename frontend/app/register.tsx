import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError("");
    if (!nom || !prenom || !email || !password) {
      setError("Tous les champs sont requis");
      return;
    }
    if (password.length < 6) {
      setError("Mot de passe: 6 caractères minimum");
      return;
    }
    try {
      setLoading(true);
      await register(email.trim(), password, nom.trim(), prenom.trim());
      router.replace("/(app)/menu");
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>UDAMG</Text>
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Rejoignez la mission</Text>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Prénom</Text>
            <TextInput testID="register-prenom-input" value={prenom} onChangeText={setPrenom} style={styles.input} placeholderTextColor={colors.muted} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Nom</Text>
            <TextInput testID="register-nom-input" value={nom} onChangeText={setNom} style={styles.input} placeholderTextColor={colors.muted} />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput testID="register-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholderTextColor={colors.muted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput testID="register-password-input" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholderTextColor={colors.muted} />
        </View>

        {!!error && <Text style={styles.error} testID="register-error">{error}</Text>}

        <Pressable
          testID="register-submit-button"
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.cta, (pressed || loading) && { opacity: 0.85 }]}
        >
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaLabel}>Créer mon compte</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Déjà un compte ? </Text>
          <Link href="/login" testID="register-go-login"><Text style={styles.footerLink}>Se connecter</Text></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.md },
  brand: { fontSize: 28, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 2, textAlign: "center", marginBottom: spacing.lg },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing.lg },
  row: { flexDirection: "row", gap: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 16, minHeight: 52,
  },
  error: { color: colors.error, fontSize: 13 },
  cta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg, minHeight: 54,
  },
  ctaLabel: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  footerText: { color: colors.muted },
  footerLink: { color: colors.brandPrimary, fontWeight: "600" },
});
