import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Modal, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Message, fmtDateTime } from "@/src/api";
import { canSendMessages } from "@/src/roles";
import { useToast } from "@/src/toast";
import { colors, spacing, radius } from "@/src/theme";

export default function MessagesList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { user, token } = useAuth();
  const sender = canSendMessages(user?.role);
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const list = useQuery({
    queryKey: ["messages", "list"],
    queryFn: () => api<Message[]>("/messages", {}, token),
    enabled: !!token,
    refetchInterval: 10000,
  });

  const send = useMutation({
    mutationFn: () => api<Message>("/messages", { method: "POST", body: JSON.stringify({ title: title.trim(), body: body.trim() }) }, token),
    onSuccess: () => {
      toast("Message diffusé à tous les utilisateurs ✓");
      setCompose(false); setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e: any) => toast(e?.message || "Envoi impossible"),
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="messages-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Messagerie</Text>
          <Text style={styles.sub}>{sender ? "Diffusion à tous · suivi de lecture" : "Annonces — lecture seule"}</Text>
        </View>
        {sender && (
          <Pressable testID="messages-compose" onPress={() => setCompose(true)} style={styles.composeBtn}>
            <Text style={styles.composeTxt}>+ Nouveau</Text>
          </Pressable>
        )}
      </View>

      {list.isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📣</Text>
              <Text style={styles.emptyTxt}>Aucun message pour le moment.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`message-row-${item.id}`}
              onPress={() => router.push(`/(app)/messages/${item.id}` as any)}
              style={({ pressed }) => [styles.row, !item.read && styles.rowUnread, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.rowHead}>
                {!item.read && <View style={styles.dot} />}
                <Text style={[styles.rowTitle, !item.read && { fontWeight: "800" }]} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowDate}>{fmtDateTime(item.created_at)}</Text>
              </View>
              <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
              <View style={styles.rowFoot}>
                <Text style={styles.rowSender}>De {item.sender_name}</Text>
                {sender && (
                  <Text style={styles.rowReads} testID={`message-reads-${item.id}`}>
                    👁 {item.read_count}/{item.recipients_count} lu{item.read_count > 1 ? "s" : ""}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={compose} animationType="slide" onRequestClose={() => setCompose(false)}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[styles.modalScroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouveau message</Text>
              <Pressable testID="compose-cancel" onPress={() => setCompose(false)} hitSlop={8}><Text style={styles.cancel}>Annuler</Text></Pressable>
            </View>
            <Text style={styles.hint}>Diffusé à tous les utilisateurs. Les destinataires ne peuvent pas répondre.</Text>
            <Text style={styles.label}>Titre</Text>
            <TextInput testID="compose-title" value={title} onChangeText={setTitle} placeholder="Objet du message" placeholderTextColor={colors.muted} style={styles.input} maxLength={140} />
            <Text style={styles.label}>Message</Text>
            <TextInput testID="compose-body" value={body} onChangeText={setBody} placeholder="Votre annonce…" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} multiline maxLength={5000} />
          </ScrollView>
          <View style={[styles.footerBar, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable
              testID="compose-send"
              disabled={send.isPending || !title.trim() || !body.trim()}
              onPress={() => send.mutate()}
              style={({ pressed }) => [styles.cta, (pressed || send.isPending || !title.trim() || !body.trim()) && { opacity: 0.7 }]}
            >
              {send.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaTxt}>Diffuser le message</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, lineHeight: 30 },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted },
  composeBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, minHeight: 44, justifyContent: "center", borderRadius: radius.pill },
  composeTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm },
  row: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 6 },
  rowUnread: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface },
  rowDate: { fontSize: 11, color: colors.muted },
  rowBody: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  rowFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  rowSender: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
  rowReads: { fontSize: 11, color: colors.brandPrimary, fontWeight: "700" },
  empty: { alignItems: "center", marginTop: spacing.xxxl, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTxt: { color: colors.muted },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalScroll: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  modalTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  cancel: { color: colors.brandPrimary, fontWeight: "600", padding: spacing.sm },
  hint: { color: colors.muted, fontSize: 12, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 16, minHeight: 52 },
  textarea: { minHeight: 160, textAlignVertical: "top" },
  footerBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, minHeight: 52, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
});
