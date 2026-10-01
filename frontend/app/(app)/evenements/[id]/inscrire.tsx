import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle2, Mail, MessageSquare, QrCode } from "lucide-react-native";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { EVENT_PROFILS, CATEGORIES_AGE, EventParticipant, EventProfil, CategorieAge, profilColor } from "@/src/event-api";
import { colors, spacing, radius } from "@/src/theme";

type Mode = "self" | "other" | "edit";
type Delivery = { message_sent: boolean; email_sent: boolean; email_error?: string | null };
type Result = EventParticipant & { delivery?: Delivery };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Inscription depuis l'application :
 *  - self  : « Je m'inscris » (nom/prénom du compte, badge → Messagerie + email)
 *  - other : « Inscrire une autre personne » (email du bénéficiaire obligatoire, badge → email)
 *  - edit  : « Voir mon badge / Modifier » (modification de mon inscription)
 */
export default function Inscrire() {
  const { token } = useAuth();
  const { id, mode: rawMode, titre } = useLocalSearchParams<{ id: string; mode?: string; titre?: string }>();
  const mode: Mode = rawMode === "other" ? "other" : rawMode === "edit" ? "edit" : "self";

  const myReg = useQuery({
    queryKey: ["my-registration", id],
    queryFn: () => api<EventParticipant | null>(`/event/participants/me?evenement_id=${id}`, {}, token),
    enabled: !!token && !!id && mode === "edit",
  });

  if (mode === "edit" && myReg.isLoading) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }
  // key = id de l'inscription : le formulaire est (ré)initialisé avec les valeurs chargées
  return <RegistrationForm key={myReg.data?.id ?? mode} id={id} mode={mode} titre={titre} existing={mode === "edit" ? myReg.data ?? null : null} />;
}

function RegistrationForm({ id, mode, titre, existing }: { id: string; mode: Mode; titre?: string; existing: EventParticipant | null }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { token, user } = useAuth();

  const [profil, setProfil] = useState<EventProfil>(existing?.profil ?? (mode === "other" ? "Externe" : "Membre"));
  const [age, setAge] = useState<CategorieAge | null>(existing?.categorie_age ?? null);
  const [f, setF] = useState({
    nom: existing?.nom ?? "", prenom: existing?.prenom ?? "", tel: existing?.tel ?? "",
    email: existing?.email ?? (mode === "self" ? user?.email || "" : ""), eglise: existing?.eglise ?? "",
  });
  const [done, setDone] = useState<Result | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-registration", id] });
    qc.invalidateQueries({ queryKey: ["event-participants", id] });
    qc.invalidateQueries({ queryKey: ["messages"] });
  };

  const register = useMutation({
    mutationFn: () => {
      const common = { evenement_id: id, profil, categorie_age: age, tel: f.tel || null, eglise: f.eglise || null, jours_presence: [] as string[] };
      if (mode === "other") {
        return api<Result>("/event/participants/other", { method: "POST", body: JSON.stringify({ ...common, nom: f.nom, prenom: f.prenom, email: f.email.trim() }) }, token);
      }
      return api<Result>("/event/participants/me", { method: "POST", body: JSON.stringify({ ...common, email: f.email.trim() || null }) }, token);
    },
    onSuccess: (p) => { invalidate(); setDone(p); },
    onError: (e: any) => toast.show(e?.message || "Inscription impossible", "error"),
  });

  const update = useMutation({
    mutationFn: () => api<EventParticipant>(`/event/participants/me/${existing!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ profil, categorie_age: age, tel: f.tel || null, email: f.email.trim() || null, eglise: f.eglise || null }),
    }, token),
    onSuccess: () => { invalidate(); toast.show("Inscription mise à jour", "success"); },
    onError: (e: any) => toast.show(e?.message || "Mise à jour impossible", "error"),
  });

  const submit = () => {
    if (mode === "other") {
      if (!f.nom.trim() || !f.prenom.trim()) { toast.show("Nom et prénom du bénéficiaire requis", "error"); return; }
      if (!EMAIL_RE.test(f.email.trim())) { toast.show("Email du bénéficiaire obligatoire (pour recevoir le badge)", "error"); return; }
    }
    if (mode === "edit") update.mutate(); else register.mutate();
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/(app)/evenements/${id}`));
  const title = mode === "other" ? "Inscrire une autre personne" : mode === "edit" ? "Mon inscription" : "Je m'inscris";
  const pending = register.isPending || update.isPending;

  if (done) {
    const d = done.delivery;
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.doneWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <CheckCircle2 size={64} color={colors.success} />
          <Text style={styles.doneTitle} testID="insc-done-title">Inscription confirmée</Text>
          <Text style={styles.doneName}>{done.prenom} {done.nom}</Text>
          <Text style={styles.doneBadge} testID="insc-done-badge">{done.badge_id}</Text>
          <Text style={styles.doneMeta}>Profil : {done.profil}</Text>

          <View style={styles.deliveryBox}>
            {mode === "self" && (
              <View style={styles.deliveryRow}>
                <MessageSquare size={18} color={d?.message_sent ? colors.success : colors.muted} />
                <Text style={styles.deliveryTxt}>{d?.message_sent ? "Badge déposé dans votre Messagerie" : "Messagerie : dépôt impossible"}</Text>
              </View>
            )}
            <View style={styles.deliveryRow}>
              <Mail size={18} color={d?.email_sent ? colors.success : colors.warning} />
              <Text style={styles.deliveryTxt}>
                {d?.email_sent ? `Badge envoyé par email à ${done.email}` : (d?.email_error ? `Email non envoyé : ${d.email_error}` : "Aucun email renseigné")}
              </Text>
            </View>
          </View>

          <Pressable testID="insc-see-badge" onPress={() => router.push(`/badge?event=${id}&b=${done.badge_id}`)} style={[styles.cta, { marginTop: spacing.lg }]}>
            <QrCode size={18} color={colors.onBrandPrimary} />
            <Text style={styles.ctaTxt}>{mode === "self" ? "Voir mon badge" : "Voir le badge"}</Text>
          </Pressable>
          <Pressable testID="insc-back-event" onPress={goBack} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>Retour à l&apos;événement</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="inscrire-back" onPress={goBack} style={styles.back} hitSlop={8}>
          <ChevronLeft size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow} numberOfLines={1}>{titre || "Événement"}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
        {mode === "edit" && existing && (
          <Pressable testID="edit-see-badge" onPress={() => router.push(`/badge?event=${id}&b=${existing.badge_id}`)} style={styles.badgeCard}>
            <QrCode size={28} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.badgeLbl}>MON BADGE</Text>
              <Text style={styles.badgeId}>{existing.badge_id}</Text>
            </View>
            <Text style={styles.badgeLink}>Afficher le QR ›</Text>
          </Pressable>
        )}

        {mode === "self" ? (
          <View style={styles.identity}>
            <Text style={styles.identityName}>{user?.prenom} {user?.nom}</Text>
            <Text style={styles.identitySub}>Inscription liée à votre compte · votre badge sera envoyé dans la Messagerie et par email</Text>
          </View>
        ) : mode === "other" ? (
          <>
            <Text style={styles.label}>Bénéficiaire</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextInput testID="insc-prenom" placeholder="Prénom *" placeholderTextColor={colors.muted} value={f.prenom} onChangeText={t => setF({ ...f, prenom: t })} style={[styles.input, { flex: 1 }]} />
              <TextInput testID="insc-nom" placeholder="Nom *" placeholderTextColor={colors.muted} value={f.nom} onChangeText={t => setF({ ...f, nom: t })} style={[styles.input, { flex: 1 }]} />
            </View>
            <TextInput testID="insc-email" placeholder="Email du bénéficiaire * (réception du badge)" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={t => setF({ ...f, email: t })} style={styles.input} />
          </>
        ) : null}

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Profil</Text>
        <View style={styles.grid}>
          {EVENT_PROFILS.map(p => (
            <Pressable key={p} testID={`insc-profil-${p}`} onPress={() => setProfil(p)} style={[styles.chip, profil === p && { backgroundColor: profilColor(p), borderColor: profilColor(p) }]}>
              <Text style={[styles.chipTxt, profil === p && { color: "#FFFFFF" }]}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Catégorie d&apos;âge</Text>
        <View style={styles.grid}>
          {CATEGORIES_AGE.map(c => (
            <Pressable key={c} testID={`insc-age-${c}`} onPress={() => setAge(age === c ? null : c)} style={[styles.chip, age === c && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
              <Text style={[styles.chipTxt, age === c && { color: "#FFFFFF" }]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Coordonnées</Text>
        <TextInput testID="insc-tel" placeholder="Téléphone" placeholderTextColor={colors.muted} keyboardType="phone-pad" value={f.tel} onChangeText={t => setF({ ...f, tel: t })} style={styles.input} />
        {mode !== "other" && (
          <TextInput testID="insc-email" placeholder="Email (réception du badge)" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={t => setF({ ...f, email: t })} style={styles.input} />
        )}
        <TextInput testID="insc-eglise" placeholder="Église (ex : CCMG Paris)" placeholderTextColor={colors.muted} value={f.eglise} onChangeText={t => setF({ ...f, eglise: t })} style={styles.input} />

        <Pressable testID="insc-submit" onPress={submit} disabled={pending || (mode === "edit" && !existing)} style={[styles.cta, (pending || (mode === "edit" && !existing)) && { opacity: 0.5 }]}>
          {pending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
            <Text style={styles.ctaTxt}>{mode === "edit" ? "Enregistrer les modifications" : mode === "other" ? "Inscrire et envoyer le badge" : "Confirmer mon inscription"}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  back: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  identity: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, gap: 4, borderWidth: 1, borderColor: colors.brandSecondary },
  identityName: { color: colors.onSurface, fontWeight: "800", fontSize: 17 },
  identitySub: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  badgeCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: "#D4A017", backgroundColor: colors.surfaceSecondary, marginBottom: spacing.lg },
  badgeLbl: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  badgeId: { color: colors.brandPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  badgeLink: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  label: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: 14, marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { flexBasis: "47%", flexGrow: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", minHeight: 48, justifyContent: "center" },
  chipTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 13, textAlign: "center" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 52, marginTop: spacing.sm },
  cta: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", minHeight: 54, justifyContent: "center", marginTop: spacing.xl },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  linkBtn: { padding: spacing.lg, alignItems: "center" },
  linkTxt: { color: colors.brandPrimary, fontWeight: "700" },
  doneWrap: { padding: spacing.xl, alignItems: "center", gap: 6, paddingTop: spacing.xxl },
  doneTitle: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  doneName: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  doneBadge: { fontSize: 22, fontWeight: "900", color: colors.brandPrimary, letterSpacing: 2, marginTop: 4 },
  doneMeta: { color: colors.muted, fontSize: 14 },
  deliveryBox: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deliveryTxt: { color: colors.onSurface, fontSize: 13, flex: 1 },
});
