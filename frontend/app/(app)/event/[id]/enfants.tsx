import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type EnfantsResp = { total: number; session_id: string | null; session_nom: string | null };

export default function Enfants() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string }>();
  const [multiOpen, setMultiOpen] = useState(false);
  const [multiValue, setMultiValue] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["enfants", id],
    queryFn: () => api<EnfantsResp>(`/event/enfants?evenement_id=${id}`, {}, token),
    enabled: !!token && !!id,
    refetchInterval: 3000,
  });

  const addMut = useMutation({
    mutationFn: (delta: number) => api<EnfantsResp>(`/event/enfants`, {
      method: "POST",
      body: JSON.stringify({ evenement_id: id, delta }),
    }, token),
    onSuccess: (r) => {
      qc.setQueryData(["enfants", id], r);
      qc.invalidateQueries({ queryKey: ["event-dashboard", id] });
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  const locked = !data?.session_id;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="enfants-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{titre || ""}</Text>
          <Text style={styles.title}>Comptage enfants</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <>
          <View style={[styles.status, locked ? styles.statusOff : styles.statusOn]}>
            <Text style={styles.statusTxt}>
              {locked ? "Aucune séance active" : `Séance : ${data?.session_nom}`}
            </Text>
          </View>

          <View style={styles.total}>
            <Text style={styles.totalNum} testID="enfants-total">{data?.total ?? 0}</Text>
            <Text style={styles.totalLbl}>enfants</Text>
          </View>

          <View style={styles.buttons}>
            <Pressable
              testID="enfants-plus"
              onPress={() => addMut.mutate(1)}
              disabled={locked || addMut.isPending}
              style={[styles.bigBtn, { backgroundColor: colors.success }, (locked || addMut.isPending) && { opacity: 0.5 }]}
            >
              <Text style={styles.bigNum}>+1</Text>
              <Text style={styles.bigLbl}>Ajouter un enfant</Text>
            </Pressable>

            <View style={styles.smallRow}>
              <Pressable
                testID="enfants-multi"
                onPress={() => setMultiOpen(true)}
                disabled={locked}
                style={[styles.smallBtn, { backgroundColor: colors.brandPrimary }, locked && { opacity: 0.5 }]}
              >
                <Text style={styles.smallTxt}>+N (multiple)</Text>
              </Pressable>
              <Pressable
                testID="enfants-minus"
                onPress={() => addMut.mutate(-1)}
                disabled={locked || (data?.total ?? 0) <= 0}
                style={[styles.smallBtn, { backgroundColor: colors.error }, (locked || (data?.total ?? 0) <= 0) && { opacity: 0.5 }]}
              >
                <Text style={styles.smallTxt}>-1</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      <Modal visible={multiOpen} transparent animationType="fade" onRequestClose={() => setMultiOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajouter plusieurs enfants</Text>
            <TextInput
              testID="enfants-multi-input"
              value={multiValue}
              onChangeText={setMultiValue}
              keyboardType="number-pad"
              placeholder="Combien ?"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <View style={styles.modalRow}>
              <Pressable onPress={() => { setMultiOpen(false); setMultiValue(""); }} style={[styles.btn, styles.btnGrey]}>
                <Text style={styles.btnGreyTxt}>Annuler</Text>
              </Pressable>
              <Pressable
                testID="enfants-multi-submit"
                onPress={() => {
                  const n = parseInt(multiValue, 10);
                  if (!isNaN(n) && n > 0) {
                    addMut.mutate(n);
                    setMultiOpen(false);
                    setMultiValue("");
                  }
                }}
                style={[styles.btn, styles.btnPrimary]}
              >
                <Text style={styles.btnPrimaryTxt}>Ajouter</Text>
              </Pressable>
            </View>
          </View>
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
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  status: { marginHorizontal: spacing.xl, padding: spacing.sm, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  statusOn: { backgroundColor: colors.success },
  statusOff: { backgroundColor: colors.warning },
  statusTxt: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  total: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl },
  totalNum: { color: colors.brandPrimary, fontSize: 100, fontWeight: "900" },
  totalLbl: { color: colors.muted, fontSize: 16, fontWeight: "700", marginTop: -spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  buttons: { paddingHorizontal: spacing.xl, gap: spacing.md },
  bigBtn: {
    padding: spacing.xxl, borderRadius: radius.lg, alignItems: "center", gap: spacing.xs, minHeight: 180,
    justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  bigNum: { color: "#FFFFFF", fontSize: 72, fontWeight: "900" },
  bigLbl: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  smallRow: { flexDirection: "row", gap: spacing.md },
  smallBtn: { flex: 1, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", minHeight: 56, justifyContent: "center" },
  smallTxt: { color: "#FFFFFF", fontWeight: "800" },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 18, minHeight: 52, textAlign: "center", fontWeight: "800" },
  modalRow: { flexDirection: "row", gap: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 48 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
});
