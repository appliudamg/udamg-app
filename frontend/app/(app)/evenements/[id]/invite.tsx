import { useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, User, Invitation, roleLabel } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function InviteElders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users", {}, token),
    enabled: !!token,
  });

  const { data: invs } = useQuery({
    queryKey: ["invitations", id],
    queryFn: () => api<Invitation[]>(`/evenements/${id}/invitations`, {}, token),
    enabled: !!token && !!id,
  });

  const alreadyInvited = new Set(invs?.map(i => i.user_id) ?? []);

  const invite = useMutation({
    mutationFn: () =>
      api<{ created: number; total: number }>("/invitations", {
        method: "POST",
        body: JSON.stringify({
          evenement_id: id,
          user_ids: Array.from(selected),
          special: true,
        }),
      }, token),
    onSuccess: (res) => {
      setToast(`${res.created} invitation(s) envoyée(s) ✨`);
      setSelected(new Set());
      setTimeout(() => router.back(), 900);
    },
    onError: (e: any) => setToast(e?.message || "Erreur"),
  });

  const toggle = (uid: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(uid) ? n.delete(uid) : n.add(uid);
      return n;
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="invite-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={styles.badgeRow}>
            <Text style={styles.badge}>✨ SPÉCIAL</Text>
          </View>
          <Text style={styles.title}>Inviter les anciens</Text>
          <Text style={styles.sub}>{selected.size} sélectionné(s)</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 96, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>Aucun membre à inviter</Text>}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            const alreadyDone = alreadyInvited.has(item.id);
            return (
              <Pressable
                testID={`invite-user-${item.id}`}
                onPress={() => !alreadyDone && toggle(item.id)}
                disabled={alreadyDone}
                style={[styles.row, isSelected && styles.rowSelected, alreadyDone && { opacity: 0.5 }]}
              >
                <View style={styles.avatar}><Text style={styles.avatarTxt}>{item.prenom[0]}{item.nom[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.prenom} {item.nom}</Text>
                  <Text style={styles.roleTxt}>{roleLabel(item.role)} · {item.email}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                  {isSelected && <Text style={styles.checkTxt}>✓</Text>}
                  {alreadyDone && !isSelected && <Text style={styles.doneTxt}>✓</Text>}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {!!toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 90 }]} testID="invite-toast">
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}

      <Pressable
        testID="invite-send"
        onPress={() => invite.mutate()}
        disabled={selected.size === 0 || invite.isPending}
        style={[styles.stickyCta, { paddingBottom: insets.bottom + spacing.md, opacity: selected.size === 0 ? 0.5 : 1 }]}
      >
        {invite.isPending ? (
          <ActivityIndicator color={colors.onBrandPrimary} />
        ) : (
          <Text style={styles.ctaTxt}>Envoyer l'invitation ({selected.size})</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  badgeRow: { flexDirection: "row" },
  badge: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: 13 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  roleTxt: { color: colors.muted, fontSize: 12, marginTop: 2 },
  checkbox: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  checkTxt: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800" },
  doneTxt: { color: colors.success, fontSize: 14, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  stickyCta: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 0,
    backgroundColor: colors.brandPrimary, borderRadius: radius.md,
    paddingTop: spacing.lg, alignItems: "center",
    shadowColor: colors.brandPrimary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  ctaTxt: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700", paddingBottom: spacing.md },
  toast: {
    position: "absolute", left: spacing.lg, right: spacing.lg,
    backgroundColor: colors.surfaceInverse, padding: spacing.md, borderRadius: radius.md,
  },
  toastTxt: { color: colors.onSurfaceInverse, textAlign: "center", fontWeight: "600" },
});
