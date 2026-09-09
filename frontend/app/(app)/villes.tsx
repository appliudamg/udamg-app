import { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator, RefreshControl,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Ville, normalize } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Villes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const isPasteur = user?.role === "pasteur";
  const canManage = isPasteur; // Only pasteur creates/deletes churches

  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({ nom: "", code_postal: "", pays: "France" });

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["villes"],
    queryFn: () => api<Ville[]>("/villes", {}, token),
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = normalize(q.trim());
    if (!s) return data;
    return data.filter(v => normalize(v.nom).includes(s) || (v.code_postal ?? "").includes(s));
  }, [data, q]);

  const createMut = useMutation({
    mutationFn: () => api<Ville>("/villes", {
      method: "POST",
      body: JSON.stringify(f),
    }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["villes"] });
      setCreateOpen(false);
      setF({ nom: "", code_postal: "", pays: "France" });
    },
  });

  const delMut = useMutation({
    mutationFn: (vid: string) => api(`/villes/${vid}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["villes"] }),
  });

  const askDelete = (v: Ville) => {
    const msg = `Supprimer l'église "${v.nom}" ?`;
    const doDel = () => delMut.mutate(v.id);
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
        <Pressable testID="villes-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MISSION</Text>
          <Text style={styles.title}>Églises de France</Text>
        </View>
        {canManage && (
          <Pressable testID="villes-create" onPress={() => setCreateOpen(true)} style={styles.newBtn}>
            <Text style={styles.newTxt}>+ Nouveau</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="villes-search-input"
          placeholder="Rechercher une église"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errTxt}>Erreur de chargement</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryTxt}>Réessayer</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(v) => v.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListHeaderComponent={
            isPasteur ? (
              <Pressable
                testID="villes-global"
                onPress={() => router.push(`/(app)/context/ville/GLOBAL?nom=${encodeURIComponent("Bilan Global")}`)}
                style={styles.globalBtn}
              >
                <Text style={styles.globalTxt}>Bilan Global (toutes les églises)</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Aucune église trouvée</Text>}
          renderItem={({ item }) => (
            <View style={styles.gridCard} testID={`ville-card-${item.id}`}>
              <Pressable
                onPress={() => router.push(`/(app)/context/ville/${item.id}?nom=${encodeURIComponent(item.nom)}`)}
                style={({ pressed }) => [{ gap: spacing.sm, padding: spacing.lg, minHeight: 130 }, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.gridBadge}>
                  <Text style={styles.gridBadgeTxt}>{item.nom.replace("CCMG ", "").slice(0, 2).toUpperCase()}</Text>
                </View>
                <Text style={styles.gridTitle} numberOfLines={2}>{item.nom}</Text>
                {!!item.code_postal && <Text style={styles.gridSub}>{item.code_postal}</Text>}
              </Pressable>
              {isPasteur && (
                <Pressable
                  testID={`ville-delete-${item.id}`}
                  onPress={() => askDelete(item)}
                  style={styles.delBtn}
                  hitSlop={8}
                >
                  <Text style={styles.delTxt}>Supprimer</Text>
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
              <Text style={styles.modalTitle}>Nouvelle église</Text>
              <TextInput
                testID="ville-form-nom"
                value={f.nom}
                onChangeText={(t) => setF({ ...f, nom: t })}
                placeholder="Nom de l'église (ex. CCMG Lyon)"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <TextInput
                testID="ville-form-cp"
                value={f.code_postal}
                onChangeText={(t) => setF({ ...f, code_postal: t })}
                placeholder="Code postal (optionnel)"
                placeholderTextColor={colors.muted}
                style={styles.input}
                keyboardType="number-pad"
              />
              <View style={styles.modalRow}>
                <Pressable onPress={() => setCreateOpen(false)} style={[styles.btn, styles.btnGrey]}>
                  <Text style={styles.btnGreyTxt}>Fermer</Text>
                </Pressable>
                <Pressable
                  testID="ville-form-submit"
                  onPress={() => f.nom.trim() && createMut.mutate()}
                  disabled={!f.nom.trim() || createMut.isPending}
                  style={[styles.btn, styles.btnPrimary, (!f.nom.trim() || createMut.isPending) && { opacity: 0.5 }]}
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
  searchWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  search: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, minHeight: 48,
  },
  gridCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  gridBadge: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  gridBadgeTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  gridTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  gridSub: { color: colors.muted, fontSize: 12 },
  delBtn: { backgroundColor: "#FEE2E2", paddingVertical: 8, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border },
  delTxt: { color: colors.error, fontWeight: "700", fontSize: 12 },
  globalBtn: {
    backgroundColor: colors.brandPrimary, padding: spacing.lg, borderRadius: radius.md,
    marginBottom: spacing.md, alignItems: "center",
  },
  globalTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl, flex: 1 },
  errTxt: { color: colors.error },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md },
  retryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalWrap: { justifyContent: "center" },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 48 },
  modalRow: { flexDirection: "row", gap: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
