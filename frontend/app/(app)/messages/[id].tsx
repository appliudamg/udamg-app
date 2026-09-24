import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Message, MessageReads, ReadEntry, fmtDateTime, roleLabel } from "@/src/api";
import { canSendMessages } from "@/src/roles";
import { useToast } from "@/src/toast";
import { confirmAction } from "@/src/confirm";
import { colors, spacing, radius } from "@/src/theme";

export default function MessageDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { user, token } = useAuth();
  const sender = canSendMessages(user?.role);
  const [tab, setTab] = useState<"read" | "unread">("read");

  const msg = useQuery({
    queryKey: ["messages", "detail", id],
    queryFn: () => api<Message>(`/messages/${id}`, {}, token),
    enabled: !!token && !!id,
  });

  // Marquer comme lu dès l'ouverture
  const markRead = useMutation({
    mutationFn: () => api<Message>(`/messages/${id}/read`, { method: "POST" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });
  useEffect(() => {
    if (msg.data && !msg.data.read && !markRead.isPending && !markRead.isSuccess) markRead.mutate();
  }, [msg.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suivi de lecture "temps réel" (rafraîchi toutes les 4 s) pour les émetteurs
  const reads = useQuery({
    queryKey: ["messages", "reads", id],
    queryFn: () => api<MessageReads>(`/messages/${id}/reads`, {}, token),
    enabled: !!token && !!id && sender,
    refetchInterval: 4000,
  });

  const del = useMutation({
    mutationFn: () => api(`/messages/${id}`, { method: "DELETE" }, token),
    onSuccess: () => { toast("Message supprimé"); qc.invalidateQueries({ queryKey: ["messages"] }); router.back(); },
    onError: (e: any) => toast(e?.message || "Suppression impossible"),
  });

  const confirmDelete = () => confirmAction("Supprimer ce message ?", "Il disparaîtra pour tous les destinataires.", () => del.mutate());

  const m = msg.data;
  const entries: ReadEntry[] = tab === "read" ? (reads.data?.read ?? []) : (reads.data?.unread ?? []);
  const pct = reads.data && reads.data.recipients_count > 0
    ? Math.round((reads.data.read_count / reads.data.recipients_count) * 100) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="message-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Message</Text>
        {sender && (
          <Pressable testID="message-delete" onPress={confirmDelete} style={styles.delBtn} hitSlop={8}>
            <Text style={styles.delTxt}>Supprimer</Text>
          </Pressable>
        )}
      </View>

      {msg.isLoading || !m ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.card}>
            <Text style={styles.title} testID="message-title">{m.title}</Text>
            <Text style={styles.meta}>De {m.sender_name} · {fmtDateTime(m.created_at)}</Text>
            <Text style={styles.body} testID="message-body" selectable>{m.body}</Text>
            {!sender && (
              <Text style={styles.readNote}>Vu {m.read_at ? `le ${fmtDateTime(m.read_at)}` : "à l'instant"} · canal en lecture seule</Text>
            )}
          </View>

          {sender && (
            <View style={styles.tracking}>
              <View style={styles.trackHead}>
                <Text style={styles.trackTitle}>Suivi de lecture</Text>
                <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveTxt}>En direct</Text></View>
              </View>
              <Text style={styles.trackCount} testID="message-read-count">
                {reads.data?.read_count ?? m.read_count} / {reads.data?.recipients_count ?? m.recipients_count} personnes ont vu le message
              </Text>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>

              <View style={styles.tabs}>
                <Pressable testID="tab-read" onPress={() => setTab("read")} style={[styles.tab, tab === "read" && styles.tabOn]}>
                  <Text style={[styles.tabTxt, tab === "read" && styles.tabTxtOn]}>Vu ({reads.data?.read_count ?? 0})</Text>
                </Pressable>
                <Pressable testID="tab-unread" onPress={() => setTab("unread")} style={[styles.tab, tab === "unread" && styles.tabOn]}>
                  <Text style={[styles.tabTxt, tab === "unread" && styles.tabTxtOn]}>Pas encore vu ({reads.data?.unread.length ?? 0})</Text>
                </Pressable>
              </View>

              {entries.length === 0 ? (
                <Text style={styles.emptyTxt}>{tab === "read" ? "Personne n'a encore ouvert ce message." : "Tout le monde a vu ce message."}</Text>
              ) : entries.map((e) => (
                <View key={e.user_id} style={styles.person} testID={`reader-${e.user_id}`}>
                  <View style={styles.avatar}><Text style={styles.avatarTxt}>{(e.prenom?.[0] || "") + (e.nom?.[0] || "")}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{e.prenom} {e.nom}</Text>
                    <Text style={styles.personMeta}>{roleLabel(e.role)} · {e.email}</Text>
                  </View>
                  {e.read_at ? <Text style={styles.personDate}>{fmtDateTime(e.read_at)}</Text> : <Text style={styles.pending}>—</Text>}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, lineHeight: 30 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.onSurface },
  delBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  delTxt: { color: colors.error, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted },
  body: { fontSize: 16, lineHeight: 24, color: colors.onSurface, marginTop: spacing.sm },
  readNote: { fontSize: 12, color: colors.success, marginTop: spacing.md, fontWeight: "600" },
  tracking: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  trackHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trackTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveTxt: { fontSize: 11, color: colors.success, fontWeight: "700" },
  trackCount: { color: colors.onSurfaceSecondary, fontSize: 13 },
  bar: { height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.brandPrimary, borderRadius: radius.pill },
  tabs: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  tabTxt: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  tabTxtOn: { color: colors.onBrandTertiary },
  emptyTxt: { color: colors.muted, textAlign: "center", paddingVertical: spacing.lg },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.onBrandTertiary, fontWeight: "700", fontSize: 12 },
  personName: { color: colors.onSurface, fontWeight: "600" },
  personMeta: { color: colors.muted, fontSize: 11 },
  personDate: { color: colors.success, fontSize: 11, fontWeight: "600" },
  pending: { color: colors.muted },
});
