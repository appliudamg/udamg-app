import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast, ToastProvider } from "@/src/toast";
import { api } from "@/src/api";
import { EVENT_PROFILS, CATEGORIES_AGE, EventParticipant, EventProfil, CategorieAge, profilColor } from "@/src/event-api";
import { colors, spacing, radius } from "@/src/theme";
import { CheckCircle2 } from "lucide-react-native";

function Inner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { event, titre } = useLocalSearchParams<{ event: string; titre?: string }>();
  const [profil, setProfil] = useState<EventProfil | null>(null);
  const [age, setAge] = useState<CategorieAge | null>(null);
  const [f, setF] = useState({ nom: "", prenom: "", tel: "", email: "", eglise: "", referent: "" });
  const [guideOpen, setGuideOpen] = useState(false);
  const [done, setDone] = useState<EventParticipant | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      api<EventParticipant>("/event/participants/public", {
        method: "POST",
        body: JSON.stringify({
          evenement_id: event,
          nom: f.nom, prenom: f.prenom,
          profil: profil || "Externe",
          categorie_age: age,
          tel: f.tel || null, email: f.email || null,
          eglise: f.eglise || null, referent: f.referent || null,
          jours_presence: [],
        }),
      }),
    onSuccess: (p) => {
      setDone(p);
      toast.show(`Inscription confirmée · ${p.badge_id}`, "success");
    },
    onError: (e: any) => toast.show(e?.message || "Erreur", "error"),
  });

  if (done) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.doneWrap}>
          <CheckCircle2 size={64} color={colors.success} />
          <Text style={styles.doneTitle}>Inscription confirmée</Text>
          <Text style={styles.doneName}>{done.prenom} {done.nom}</Text>
          <Text style={styles.doneBadge}>{done.badge_id}</Text>
          <Text style={styles.doneMeta}>Profil : {done.profil}</Text>
          {!!done.eglise && <Text style={styles.doneMeta}>Église : {done.eglise}</Text>}
          <Pressable
            testID="insc-see-badge"
            onPress={() => router.push(`/badge?event=${event}&b=${done.badge_id}`)}
            style={[styles.cta, { marginTop: spacing.xl }]}
          >
            <Text style={styles.ctaTxt}>Voir mon badge</Text>
          </Pressable>
          <Pressable onPress={() => { setDone(null); setProfil(null); setF({ nom: "", prenom: "", tel: "", email: "", eglise: "", referent: "" }); }} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>Nouvelle inscription</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, paddingTop: insets.top + spacing.lg }} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>UDAMG</Text>
        <Text style={styles.title}>Inscription</Text>
        {!!titre && <Text style={styles.subtitle}>{titre}</Text>}

        <Text style={styles.label}>Votre profil <Text style={styles.helpLink} onPress={() => setGuideOpen(true)}>· Aide</Text></Text>
        <View style={styles.profilGrid}>
          {EVENT_PROFILS.map(p => (
            <Pressable
              key={p}
              testID={`insc-profil-${p}`}
              onPress={() => setProfil(p)}
              style={[
                styles.profilCard,
                profil === p && { backgroundColor: profilColor(p), borderColor: profilColor(p) },
              ]}
            >
              <Text style={[styles.profilName, profil === p && { color: "#FFFFFF" }]}>{p}</Text>
            </Pressable>
          ))}
        </View>

        {profil && (
          <>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TextInput testID="insc-prenom" placeholder="Prénom *" placeholderTextColor={colors.muted}
                         value={f.prenom} onChangeText={t => setF({ ...f, prenom: t })}
                         style={[styles.input, { flex: 1 }]} />
              <TextInput testID="insc-nom" placeholder="Nom *" placeholderTextColor={colors.muted}
                         value={f.nom} onChangeText={t => setF({ ...f, nom: t })}
                         style={[styles.input, { flex: 1 }]} />
            </View>
            <TextInput testID="insc-tel" placeholder="Téléphone" placeholderTextColor={colors.muted}
                       keyboardType="phone-pad" value={f.tel}
                       onChangeText={t => setF({ ...f, tel: t })} style={styles.input} />
            <TextInput testID="insc-email" placeholder="Email" placeholderTextColor={colors.muted}
                       autoCapitalize="none" keyboardType="email-address"
                       value={f.email} onChangeText={t => setF({ ...f, email: t })} style={styles.input} />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Catégorie d'âge</Text>
            <View style={styles.profilGrid}>
              {CATEGORIES_AGE.map(c => (
                <Pressable
                  key={c}
                  testID={`insc-age-${c}`}
                  onPress={() => setAge(c)}
                  style={[styles.profilCard, age === c && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                >
                  <Text style={[styles.profilName, age === c && { color: "#FFFFFF" }]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            {(profil === "Membre" || profil === "Prospect Évangélisé") && (
              <TextInput testID="insc-eglise" placeholder="Église (ex: CCMG Paris)" placeholderTextColor={colors.muted}
                         value={f.eglise} onChangeText={t => setF({ ...f, eglise: t })} style={styles.input} />
            )}
            {profil === "Prospect Évangélisé" && (
              <TextInput testID="insc-referent" placeholder="Nom du référent qui vous a invité"
                         placeholderTextColor={colors.muted} value={f.referent}
                         onChangeText={t => setF({ ...f, referent: t })} style={styles.input} />
            )}

            <Pressable
              testID="insc-submit"
              onPress={() => {
                if (!f.nom || !f.prenom) { toast.show("Nom et prénom requis", "error"); return; }
                mut.mutate();
              }}
              disabled={mut.isPending}
              style={[styles.cta, mut.isPending && { opacity: 0.5 }]}
            >
              {mut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.ctaTxt}>Confirmer l'inscription</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={guideOpen} transparent animationType="fade" onRequestClose={() => setGuideOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setGuideOpen(false)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Guide des profils</Text>
            <Text style={styles.guideItem}><Text style={styles.guideKey}>Membre : </Text>Vous êtes déjà membre d'une église CCMG.</Text>
            <Text style={styles.guideItem}><Text style={styles.guideKey}>Inconnu : </Text>Vous découvrez UDAMG pour la première fois.</Text>
            <Text style={styles.guideItem}><Text style={styles.guideKey}>Prospect Évangélisé : </Text>Un évangéliste vous a invité.</Text>
            <Text style={styles.guideItem}><Text style={styles.guideKey}>Prospect Famille : </Text>Vous venez par un membre de votre famille.</Text>
            <Text style={styles.guideItem}><Text style={styles.guideKey}>Externe : </Text>Vous venez d'une autre église ou d'ailleurs.</Text>
            <Pressable onPress={() => setGuideOpen(false)} style={[styles.cta, { marginTop: spacing.md }]}>
              <Text style={styles.ctaTxt}>Compris</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

export default function Inscription() {
  return <ToastProvider><Inner /></ToastProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  brand: { fontSize: 24, fontWeight: "800", color: colors.brandPrimary, textAlign: "center", letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, textAlign: "center", marginTop: spacing.sm },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 4, marginBottom: spacing.xl },
  label: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: 14, marginBottom: spacing.sm },
  helpLink: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  profilGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  profilCard: { flexBasis: "47%", flexGrow: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", minHeight: 48, justifyContent: "center" },
  profilName: { color: colors.onSurface, fontWeight: "700", fontSize: 13, textAlign: "center" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 15, minHeight: 52, marginTop: spacing.sm },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", minHeight: 54, justifyContent: "center", marginTop: spacing.lg },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  linkBtn: { padding: spacing.lg, alignItems: "center" },
  linkTxt: { color: colors.brandPrimary, fontWeight: "700" },
  doneWrap: { padding: spacing.xl, alignItems: "center", gap: 6 },
  doneIcon: { fontSize: 64 },
  doneTitle: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  doneName: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  doneBadge: { fontSize: 20, fontWeight: "900", color: colors.brandPrimary, letterSpacing: 2, marginTop: 4 },
  doneMeta: { color: colors.muted, fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  guideItem: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  guideKey: { color: colors.brandPrimary, fontWeight: "800" },
});
