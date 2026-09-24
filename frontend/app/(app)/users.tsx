import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, SectionList, TextInput, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, ROLES, Role, User, roleLabel, normalize } from "@/src/api";
import { useToast } from "@/src/toast";
import { confirmAction } from "@/src/confirm";
import { colors, spacing, radius } from "@/src/theme";

type FormState = { email: string; nom: string; prenom: string; role: Role; password: string };
const EMPTY: FormState = { email: "", nom: "", prenom: "", role: "membre", password: "" };

// Ordre d'affichage des blocs par rôle
const BLOCK_ORDER: Role[] = ["membre", "disciple", "ouvrier", "leader", "berger", "missionnaire", "pasteur", "admin", "equipe_technique"];

const ROLE_HELP: Record<Role, string> = {
  admin: "Accès total · gère les utilisateurs · envoie des messages",
  equipe_technique: "Ajoute/modifie les médias · envoie des messages",
  pasteur: "Tous les médias (y compris Réunions Pasteur / Conseil élargi)",
  missionnaire: "Tous les médias (y compris Réunions)",
  berger: "Tous les médias (y compris Réunions)",
  leader: "Médias sauf Réunion Pasteur / Conseil élargi",
  ouvrier: "Médias sauf Réunion Pasteur / Conseil élargi",
  disciple: "Médias sauf Réunion Pasteur / Conseil élargi",
  membre: "Médias sauf Réunion Pasteur / Conseil élargi",
};

export default function UsersAdmin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { user: me, token } = useAuth();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ mode: "create" } | { mode: "edit"; user: User } | null>(null);
  const [f, setF] = useState<FormState>(EMPTY);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<User[]>("/admin/users", {}, token),
    enabled: !!token,
  });

  const sections = useMemo(() => {
    const s = normalize(q.trim());
    const all = (users.data ?? []).filter((u) => !s || normalize(`${u.prenom} ${u.nom} ${u.email} ${roleLabel(u.role)}`).includes(s));
    return BLOCK_ORDER.map((role) => {
      const data = all.filter((u) => u.role === role).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
      const total = (users.data ?? []).filter((u) => u.role === role).length;
      return { role, title: roleLabel(role).toUpperCase(), data, total };
    }).filter((sec) => sec.total > 0 || !s);
  }, [users.data, q]);

  const save = useMutation({
    mutationFn: async () => {
      if (!open) return;
      if (open.mode === "create") {
        return api<User>("/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: f.email.trim(), nom: f.nom.trim(), prenom: f.prenom.trim(), role: f.role, password: f.password || null }),
        }, token);
      }
      return api<User>(`/admin/users/${open.user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nom: f.nom.trim(), prenom: f.prenom.trim(), role: f.role, ...(f.password ? { password: f.password } : {}) }),
      }, token);
    },
    onSuccess: (u: any) => {
      if (u?.email_sent) toast("Utilisateur enregistré ✓ · Email d'accès envoyé");
      else if (u?.email_error && f.password) toast(`Utilisateur enregistré ✓ · Email non envoyé : ${u.email_error}`);
      else toast("Utilisateur enregistré ✓");
      setOpen(null); qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: any) => toast(e?.message || "Erreur"),
  });

  const toggle = useMutation({
    mutationFn: (u: User) => api<User>(`/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ disabled: !u.disabled }) }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (e: any) => toast(e?.message || "Erreur"),
  });

  const remove = useMutation({
    mutationFn: (u: User) => api(`/admin/users/${u.id}`, { method: "DELETE" }, token),
    onSuccess: () => { toast("Utilisateur supprimé"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e: any) => toast(e?.message || "Erreur"),
  });

  const openCreate = () => { setF(EMPTY); setOpen({ mode: "create" }); };
  const openEdit = (u: User) => { setF({ email: u.email, nom: u.nom, prenom: u.prenom, role: u.role, password: "" }); setOpen({ mode: "edit", user: u }); };
  const confirmDelete = (u: User) => confirmAction("Supprimer ce compte ?", `${u.prenom} ${u.nom} (${u.email})`, () => remove.mutate(u));

  const valid = f.nom.trim() && f.prenom.trim() && (open?.mode === "edit" || (f.email.includes("@") && f.password.length >= 6));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="users-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={8}><Text style={styles.backTxt}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Équipe & Utilisateurs</Text>
          <Text style={styles.sub}>{users.data?.length ?? 0} compte(s)</Text>
        </View>
        <Pressable testID="users-add" onPress={openCreate} style={styles.addBtn}><Text style={styles.addTxt}>+ Ajouter</Text></Pressable>
      </View>

      <TextInput testID="users-search" value={q} onChangeText={setQ} placeholder="Rechercher un nom, email, rôle…" placeholderTextColor={colors.muted} style={styles.search} />

      {users.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xxl }} /> : (
        <SectionList
          sections={sections}
          keyExtractor={(u) => u.id}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead} testID={`users-block-${section.role}`}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.countPill}><Text style={styles.countTxt}>{section.total} inscrit{section.total > 1 ? "s" : ""}</Text></View>
            </View>
          )}
          renderSectionFooter={({ section }) => section.data.length === 0 ? (
            <Text style={styles.emptyBlock}>Aucun compte dans ce bloc</Text>
          ) : <View style={{ height: spacing.sm }} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={users.isRefetching} onRefresh={() => users.refetch()} tintColor={colors.brandPrimary} />}
          renderItem={({ item: u }) => (
            <View style={[styles.row, u.disabled && { opacity: 0.55 }]} testID={`user-row-${u.id}`}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{(u.prenom?.[0] || "") + (u.nom?.[0] || "")}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.prenom} {u.nom} {u.id === me?.id ? "(vous)" : ""}</Text>
                <Text style={styles.email}>{u.email}</Text>
                <View style={styles.pillRow}>
                  <View style={styles.pill}><Text style={styles.pillTxt}>{roleLabel(u.role)}</Text></View>
                  {u.disabled && <View style={[styles.pill, styles.pillOff]}><Text style={[styles.pillTxt, { color: colors.onError }]}>Désactivé</Text></View>}
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable testID={`user-edit-${u.id}`} onPress={() => openEdit(u)} style={styles.actBtn}><Text style={styles.actTxt}>Modifier</Text></Pressable>
                {u.id !== me?.id && (
                  <>
                    <Pressable testID={`user-toggle-${u.id}`} onPress={() => toggle.mutate(u)} style={styles.actBtn}><Text style={styles.actTxt}>{u.disabled ? "Activer" : "Désactiver"}</Text></Pressable>
                    <Pressable testID={`user-delete-${u.id}`} onPress={() => confirmDelete(u)} style={styles.actBtn}><Text style={[styles.actTxt, { color: colors.error }]}>Supprimer</Text></Pressable>
                  </>
                )}
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[styles.modalScroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{open?.mode === "create" ? "Nouvel utilisateur" : "Modifier l'utilisateur"}</Text>
              <Pressable testID="user-form-cancel" onPress={() => setOpen(null)} hitSlop={8}><Text style={styles.cancel}>Annuler</Text></Pressable>
            </View>

            <Text style={styles.label}>Prénom</Text>
            <TextInput testID="user-form-prenom" value={f.prenom} onChangeText={(t) => setF({ ...f, prenom: t })} style={styles.input} placeholder="Prénom" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Nom</Text>
            <TextInput testID="user-form-nom" value={f.nom} onChangeText={(t) => setF({ ...f, nom: t })} style={styles.input} placeholder="Nom" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Email</Text>
            <TextInput testID="user-form-email" value={f.email} editable={open?.mode === "create"} onChangeText={(t) => setF({ ...f, email: t })} style={[styles.input, open?.mode === "edit" && { opacity: 0.6 }]} autoCapitalize="none" keyboardType="email-address" placeholder="email@exemple.com" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>{open?.mode === "create" ? "Mot de passe (min. 6 caractères)" : "Nouveau mot de passe (optionnel)"}</Text>
            <Text style={styles.help}>📧 La personne recevra automatiquement un email avec le lien de l&apos;application, son identifiant et ce mot de passe.</Text>
            <TextInput testID="user-form-password" value={f.password} onChangeText={(t) => setF({ ...f, password: t })} style={styles.input} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} />

            <Text style={styles.label}>Rôle</Text>
            <View style={styles.roles}>
              {ROLES.map((r) => {
                const on = f.role === r.value;
                return (
                  <Pressable key={r.value} testID={`role-${r.value}`} onPress={() => setF({ ...f, role: r.value })} style={[styles.roleChip, on && styles.roleChipOn]}>
                    <Text style={[styles.roleTxt, on && styles.roleTxtOn]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.help}>{ROLE_HELP[f.role]}</Text>

            <Pressable testID="user-form-save" disabled={!valid || save.isPending} onPress={() => save.mutate()} style={({ pressed }) => [styles.cta, (!valid || pressed || save.isPending) && { opacity: 0.7 }]}>
              {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaTxt}>Enregistrer</Text>}
            </Pressable>
          </ScrollView>
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
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted },
  addBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, minHeight: 44, justifyContent: "center", borderRadius: radius.pill },
  addTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  search: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 48, backgroundColor: colors.surfaceSecondary, color: colors.onSurface },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, paddingVertical: spacing.sm, marginTop: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.brandPrimary },
  sectionTitle: { color: colors.brandPrimary, fontWeight: "800", fontSize: 13, letterSpacing: 1.2 },
  countPill: { backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  countTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  emptyBlock: { color: colors.muted, fontSize: 12, fontStyle: "italic", paddingVertical: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.onBrandTertiary, fontWeight: "700" },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  email: { color: colors.muted, fontSize: 12 },
  pillRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  pill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  pillOff: { backgroundColor: colors.error },
  pillTxt: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  actions: { justifyContent: "center", gap: 2 },
  actBtn: { minHeight: 32, justifyContent: "center", paddingHorizontal: spacing.sm },
  actTxt: { color: colors.brandPrimary, fontWeight: "600", fontSize: 12 },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalScroll: { paddingHorizontal: spacing.xl, gap: spacing.xs },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  cancel: { color: colors.brandPrimary, fontWeight: "600", padding: spacing.sm },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 16, minHeight: 52 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  roleChip: { paddingHorizontal: spacing.md, minHeight: 40, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  roleChipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  roleTxt: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 13 },
  roleTxtOn: { color: colors.onBrandPrimary },
  help: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
});
