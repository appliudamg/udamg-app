import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator,
  Modal, ScrollView, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, User, Role, Ville } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

const ROLE_LABELS: Record<Role, string> = {
  pasteur: "Pasteur",
  ouvrier: "Ouvrier",
  evangeliste: "Évangéliste",
  membre: "Membre",
};

const ROLE_COLORS: Record<Role, string> = {
  pasteur: "#8B0000",
  ouvrier: "#0369A1",
  evangeliste: "#065F46",
  membre: "#7C2D12",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  pasteur: "Accès total, toutes les églises",
  ouvrier: "Accès Pôles 1-2-3 limité à son église",
  evangeliste: "Accès Pôles 1-2-3, ses propres fiches",
  membre: "Accès Pôle 3 uniquement (médias)",
};

type UserForm = {
  email: string; prenom: string; nom: string; role: Role;
  ville_id: string | null; password: string;
};

const emptyForm: UserForm = {
  email: "", prenom: "", nom: "", role: "evangeliste", ville_id: null, password: "",
};

export default function UsersAdmin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user: me } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openForm, setOpenForm] = useState<null | { mode: "create" } | { mode: "edit"; user: User }>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<User[]>("/admin/users", {}, token),
    enabled: !!token,
  });

  const villes = useQuery({
    queryKey: ["villes"],
    queryFn: () => api<Ville[]>("/villes", {}, token),
    enabled: !!token,
  });

  const filtered = (users.data ?? []).filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (u.email + " " + u.prenom + " " + u.nom).toLowerCase().includes(s);
  });

  const openCreate = () => {
    setForm(emptyForm);
    setOpenForm({ mode: "create" });
  };

  const openEdit = (u: User) => {
    setForm({
      email: u.email, prenom: u.prenom, nom: u.nom,
      role: u.role, ville_id: u.ville_id || null, password: "",
    });
    setOpenForm({ mode: "edit", user: u });
  };

  const closeForm = () => setOpenForm(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!openForm) return;
      if (openForm.mode === "create") {
        return api<User>("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            prenom: form.prenom.trim(),
            nom: form.nom.trim(),
            role: form.role,
            ville_id: form.role === "pasteur" ? null : form.ville_id,
            password: form.password || undefined,
          }),
        }, token);
      }
      const body: any = {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        role: form.role,
      };
      if (form.role !== "pasteur") body.ville_id = form.ville_id;
      return api<User>(`/admin/users/${openForm.user.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      closeForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (uid: string) => api(`/admin/users/${uid}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const askDelete = (u: User) => {
    const msg = `Supprimer définitivement ${u.prenom} ${u.nom} (${u.email}) ?`;
    const doIt = () => deleteMut.mutate(u.id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) doIt();
      return;
    }
    Alert.alert("Confirmer", msg, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: doIt },
    ]);
  };

  const submitDisabled =
    !form.email.trim() || !form.prenom.trim() || !form.nom.trim() ||
    ((form.role === "ouvrier" || form.role === "evangeliste") && !form.ville_id);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="users-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ADMIN</Text>
          <Text style={styles.title}>Équipe & Utilisateurs</Text>
        </View>
        <Pressable testID="users-create" onPress={openCreate} style={styles.newBtn}>
          <Text style={styles.newTxt}>+ Ajouter</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="users-search"
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher email, nom, prénom"
          placeholderTextColor={colors.muted}
          style={styles.search}
        />
      </View>

      {users.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <View style={styles.userCard} testID={`user-card-${item.id}`}>
              <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[item.role] || colors.brandPrimary }]}>
                <Text style={styles.avatarTxt}>{(item.prenom[0] || "?") + (item.nom[0] || "")}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.uName} numberOfLines={1}>{item.prenom} {item.nom}</Text>
                <Text style={styles.uMail} numberOfLines={1}>{item.email}</Text>
                <View style={styles.uMeta}>
                  <View style={[styles.rolePill, { backgroundColor: ROLE_COLORS[item.role] + "22", borderColor: ROLE_COLORS[item.role] }]}>
                    <Text style={[styles.rolePillTxt, { color: ROLE_COLORS[item.role] }]}>{ROLE_LABELS[item.role]}</Text>
                  </View>
                  {!!item.ville_nom && (
                    <Text style={styles.villeChip}>· {item.ville_nom}</Text>
                  )}
                  {item.role === "pasteur" && (
                    <Text style={styles.villeChip}>· Toutes les églises</Text>
                  )}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Pressable testID={`user-edit-${item.id}`} onPress={() => openEdit(item)} style={styles.iconBtn}>
                  <Text style={styles.iconTxt}>✎</Text>
                </Pressable>
                {item.id !== me?.id && (
                  <Pressable testID={`user-del-${item.id}`} onPress={() => askDelete(item)} style={[styles.iconBtn, { backgroundColor: "#FEE2E2" }]}>
                    <Text style={[styles.iconTxt, { color: colors.error }]}>×</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucun utilisateur trouvé.</Text>}
        />
      )}

      <Modal visible={!!openForm} transparent animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {openForm?.mode === "create" ? "Nouvel utilisateur" : "Modifier"}
              </Text>
              <Pressable onPress={closeForm} hitSlop={8}><Text style={{ fontSize: 24 }}>×</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
              <Field label="Email">
                <TextInput
                  testID="form-email"
                  value={form.email}
                  onChangeText={(t) => setForm({ ...form, email: t })}
                  editable={openForm?.mode === "create"}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="exemple@udamg.app"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, openForm?.mode === "edit" && { opacity: 0.6 }]}
                />
              </Field>

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Prénom">
                    <TextInput testID="form-prenom" value={form.prenom} onChangeText={(t) => setForm({ ...form, prenom: t })}
                      placeholder="Prénom" placeholderTextColor={colors.muted} style={styles.input} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Nom">
                    <TextInput testID="form-nom" value={form.nom} onChangeText={(t) => setForm({ ...form, nom: t })}
                      placeholder="Nom" placeholderTextColor={colors.muted} style={styles.input} />
                  </Field>
                </View>
              </View>

              <Field label="Rôle">
                <View style={{ gap: 8 }}>
                  {(["pasteur", "ouvrier", "evangeliste", "membre"] as Role[]).map((r) => (
                    <Pressable
                      key={r}
                      testID={`form-role-${r}`}
                      onPress={() => setForm({ ...form, role: r, ville_id: r === "pasteur" ? null : form.ville_id })}
                      style={[styles.roleRow, form.role === r && { borderColor: ROLE_COLORS[r], backgroundColor: ROLE_COLORS[r] + "11" }]}
                    >
                      <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[r] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roleName}>{ROLE_LABELS[r]}</Text>
                        <Text style={styles.roleDesc}>{ROLE_DESCRIPTIONS[r]}</Text>
                      </View>
                      {form.role === r && <Text style={{ color: ROLE_COLORS[r], fontSize: 18, fontWeight: "800" }}>✓</Text>}
                    </Pressable>
                  ))}
                </View>
              </Field>

              {(form.role === "ouvrier" || form.role === "evangeliste" || form.role === "membre") && (
                <Field label={`Église${form.role === "membre" ? " (optionnelle)" : " *"}`}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {form.role === "membre" && (
                      <Pressable
                        onPress={() => setForm({ ...form, ville_id: null })}
                        style={[styles.villePick, form.ville_id === null && styles.villePickOn]}
                      >
                        <Text style={[styles.villePickTxt, form.ville_id === null && { color: "#FFF" }]}>Aucune</Text>
                      </Pressable>
                    )}
                    {(villes.data ?? []).map((v) => (
                      <Pressable
                        key={v.id}
                        testID={`form-ville-${v.id}`}
                        onPress={() => setForm({ ...form, ville_id: v.id })}
                        style={[styles.villePick, form.ville_id === v.id && styles.villePickOn]}
                      >
                        <Text style={[styles.villePickTxt, form.ville_id === v.id && { color: "#FFF" }]}>{v.nom}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Field>
              )}

              {openForm?.mode === "create" && (
                <Field label="Mot de passe (optionnel — sinon connexion Google uniquement)">
                  <TextInput
                    testID="form-password"
                    value={form.password}
                    onChangeText={(t) => setForm({ ...form, password: t })}
                    secureTextEntry
                    placeholder="Laisser vide pour connexion Google seulement"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </Field>
              )}

              {!!saveMut.error && (
                <Text style={styles.error}>{(saveMut.error as Error).message}</Text>
              )}

              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                <Pressable onPress={closeForm} style={[styles.btn, styles.btnGrey]}>
                  <Text style={styles.btnGreyTxt}>Annuler</Text>
                </Pressable>
                <Pressable
                  testID="form-submit"
                  onPress={() => saveMut.mutate()}
                  disabled={submitDisabled || saveMut.isPending}
                  style={[styles.btn, styles.btnPrimary, (submitDisabled || saveMut.isPending) && { opacity: 0.5 }]}
                >
                  {saveMut.isPending
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.btnPrimaryTxt}>{openForm?.mode === "create" ? "Créer" : "Enregistrer"}</Text>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text>{children}</View>);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  newBtn: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  newTxt: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  searchWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  search: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border,
    color: colors.onSurface, minHeight: 48,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  userCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#FFF", fontWeight: "900", fontSize: 14 },
  uName: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  uMail: { color: colors.muted, fontSize: 12, marginTop: 1 },
  uMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  rolePillTxt: { fontSize: 11, fontWeight: "800" },
  villeChip: { color: colors.muted, fontSize: 11 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  iconTxt: { fontSize: 16, color: colors.onSurface, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 48,
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 14,
  },
  roleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  roleDot: { width: 10, height: 10, borderRadius: 5 },
  roleName: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  roleDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  villePick: { paddingHorizontal: 14, height: 32, borderRadius: 999, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  villePickOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  villePickTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  error: { color: colors.error, fontSize: 13, textAlign: "center" },
  btn: { flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "800" },
});
