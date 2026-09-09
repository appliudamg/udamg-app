import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Programme } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Programmes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const canManage = user?.role === "pasteur" || user?.role === "ouvrier";
  const isPasteur = user?.role === "pasteur";

  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({ nom: "", description: "", is_ebed: false });

  const { data, isLoading } = useQuery({
    queryKey: ["programmes"],
    queryFn: () => api<Programme[]>("/programmes", {}, token),
    enabled: !!token,
  });

  const createMut = useMutation({
    mutationFn: () => api<Programme>("/programmes", {
      method: "POST",
      body: JSON.stringify(f),
    }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programmes"] });
      setCreateOpen(false); setF({ nom: "", description: "", is_ebed: false });
    },
  });

  const delMut = useMutation({
    mutationFn: (pid: string) => api(`/programmes/${pid}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["programmes"] }),
  });

  const askDelete = (p: Programme) => {
    const msg = `Supprimer le programme "${p.nom}" ?`;
    const doDel = () => delMut.mutate(p.id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) doDel();
      return;
    }
    Alert.alert("Confirmer", msg, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: doDel },
    ]);
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
        {canManage && (
          <Pressable testID="programmes-create" onPress={() => setCreateOpen(true)} style={styles.newBtn}>
            <Text style={styles.newTxt}>+ Nouveau</Text>
          </Pressable>
        )}
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
            <View style={[styles.card, item.is_ebed && styles.cardEbed]} testID={`programme-card-${item.id}`}>
              <Pressable
                onPress={() => router.push(`/(app)/context/programme/${item.id}?nom=${encodeURIComponent(item.nom)}`)}
                style={({ pressed }) => [{ gap: spacing.sm, padding: spacing.xl }, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.cardTop}>
                  <Text style={item.is_ebed ? styles.badgeEbed : styles.badge}>
                    {item.is_ebed ? "✨ EBED" : "PROGRAMME"}
                  </Text>
                </View>
                <Text style={styles.cardTitle}>{item.nom}</Text>
                {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
                <Text style={styles.cardCta}>Accéder →</Text>
              </Pressable>
              {isPasteur && (
                <Pressable
                  testID={`programme-delete-${item.id}`}
                  onPress={() => askDelete(item)}
                  style={styles.delBtn}
                >
                  <Text style={styles.delTxt}>🗑 Supprimer</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Nouveau programme</Text>
              <TextInput testID="programme-form-nom" value={f.nom} onChangeText={t => setF({ ...f, nom: t })}
                         placeholder="Nom du programme" placeholderTextColor={colors.muted}
                         style={styles.input} />
              <TextInput testID="programme-form-desc" value={f.description} onChangeText={t => setF({ ...f, description: t })}
                         placeholder="Description (optionnelle)" placeholderTextColor={colors.muted}
                         style={styles.input} />
              <Pressable
                testID="programme-form-ebed"
                onPress={() => setF({ ...f, is_ebed: !f.is_ebed })}
                style={[styles.toggle, f.is_ebed && styles.toggleOn]}
              >
                <Text style={[styles.toggleTxt, f.is_ebed && styles.toggleTxtOn]}>
                  {f.is_ebed ? "✓ " : ""}Convention EBED (PDF par lots de 10)
                </Text>
              </Pressable>
              <View style={styles.modalRow}>
                <Pressable onPress={() => setCreateOpen(false)} style={[styles.btn, styles.btnGrey]}>
                  <Text style={styles.btnGreyTxt}>Fermer</Text>
                </Pressable>
                <Pressable
                  testID="programme-form-submit"
                  onPress={() => f.nom && createMut.mutate()}
                  disabled={!f.nom || createMut.isPending}
                  style={[styles.btn, styles.btnPrimary, (!f.nom || createMut.isPending) && { opacity: 0.5 }]}
                >
                  {createMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryTxt}>Créer</Text>}
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
  newBtn: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  newTxt: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardEbed: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  cardTop: { flexDirection: "row" },
  badge: { backgroundColor: colors.surfaceInverse, color: colors.onSurfaceInverse, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  badgeEbed: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  cardDesc: { fontSize: 13, color: colors.muted },
  cardCta: { color: colors.brandPrimary, fontWeight: "700", marginTop: spacing.xs },
  delBtn: { backgroundColor: "#FEE2E2", padding: spacing.sm, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border },
  delTxt: { color: colors.error, fontWeight: "700", fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalWrap: { justifyContent: "center" },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  toggle: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  toggleOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  toggleTxt: { color: colors.onSurface, fontWeight: "600" },
  toggleTxtOn: { color: colors.onBrandTertiary, fontWeight: "800" },
  modalRow: { flexDirection: "row", gap: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
