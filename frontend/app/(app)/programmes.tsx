import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Programme } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Programmes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  const [selected, setSelected] = useState<Programme | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["programmes"],
    queryFn: () => api<Programme[]>("/programmes", {}, token),
    enabled: !!token,
  });

  const submitCode = async () => {
    if (!selected) return;
    setErr("");
    setChecking(true);
    try {
      await api(`/programmes/${selected.id}/access`, {
        method: "POST",
        body: JSON.stringify({ code }),
      }, token);
      router.push(`/(app)/context/programme/${selected.id}?nom=${encodeURIComponent(selected.nom)}`);
      setSelected(null);
      setCode("");
    } catch (e: any) {
      setErr(e?.message || "Code incorrect");
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="programmes-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>✨ SPÉCIAL</Text>
          <Text style={styles.title}>Programmes Spéciaux</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>Aucun programme</Text>}
          renderItem={({ item }) => (
            <Pressable
              testID={`programme-card-${item.id}`}
              onPress={() => { setSelected(item); setCode(""); setErr(""); }}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }, item.is_ebed && styles.cardEbed]}
            >
              <View style={styles.cardTop}>
                <Text style={item.is_ebed ? styles.badgeEbed : styles.badge}>
                  {item.is_ebed ? "✨ EBED" : "🔐 CODE"}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{item.nom}</Text>
              {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
              <Text style={styles.cardCta}>Accéder →</Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap}>
            <View style={styles.modalCard} testID="programme-code-modal">
              <Text style={styles.modalTitle}>Accès sécurisé</Text>
              <Text style={styles.modalSub}>{selected?.nom}</Text>
              <Text style={styles.label}>Code d'accès</Text>
              <TextInput
                testID="programme-code-input"
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                secureTextEntry
                style={styles.input}
                placeholder="Code..."
                placeholderTextColor={colors.muted}
              />
              {!!err && <Text style={styles.errTxt} testID="programme-code-error">{err}</Text>}
              <View style={styles.modalRow}>
                <Pressable
                  onPress={() => { setSelected(null); setCode(""); setErr(""); }}
                  style={[styles.btn, styles.btnGrey]}
                  testID="programme-code-close"
                >
                  <Text style={styles.btnGreyTxt}>Fermer</Text>
                </Pressable>
                <Pressable
                  onPress={submitCode}
                  disabled={checking || !code}
                  style={[styles.btn, styles.btnPrimary, (!code || checking) && { opacity: 0.5 }]}
                  testID="programme-code-submit"
                >
                  {checking ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnPrimaryTxt}>Valider</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  cardEbed: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  cardTop: { flexDirection: "row" },
  badge: { backgroundColor: colors.surfaceInverse, color: colors.onSurfaceInverse, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  badgeEbed: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  cardDesc: { fontSize: 13, color: colors.muted },
  cardCta: { color: colors.brandPrimary, fontWeight: "700", marginTop: spacing.xs },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalWrap: { justifyContent: "center" },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  modalSub: { color: colors.muted, fontSize: 13, marginBottom: spacing.xs },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 13 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 16, minHeight: 52,
  },
  errTxt: { color: colors.error, fontSize: 13 },
  modalRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", minHeight: 48, justifyContent: "center" },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
