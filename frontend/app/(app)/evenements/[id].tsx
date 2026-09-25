import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, ImageBackground, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, UserPlus, Link2, Bell, ClipboardCheck, Trash2, CalendarDays, Clock, MapPin, Users } from "lucide-react-native";
import { API_BASE } from "@/src/api";
import { useToast } from "@/src/toast";
import { confirmAction } from "@/src/confirm";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Evenement, Invitation, eventTypeLabel } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { canAdminEvents, canManageEvents, canShareEventLink, canSendRappel } from "@/src/roles";

const HERO_IMG = "https://images.unsplash.com/photo-1570786032462-2efc3ca8fccd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwyfHxjaHVyY2glMjB3b3JzaGlwJTIwZ2F0aGVyaW5nfGVufDB8fHx8MTc4ODY1MTAxOHww&ixlib=rb-4.1.0&q=85";

export default function EventDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();

  const inscriptionUrl = () => {
    const base = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : API_BASE;
    return `${base}/inscription?event=${id}&titre=${encodeURIComponent(evt?.titre || "")}`;
  };
  const copyLink = async () => {
    await Clipboard.setStringAsync(inscriptionUrl());
    toast.show("Lien d'inscription copié", "success");
  };
  const rappel = useMutation({
    mutationFn: () => api<{ recipients: number }>(`/evenements/${id}/rappel`, { method: "POST", body: JSON.stringify({}) }, token),
    onSuccess: (r) => toast.show(`Rappel envoyé dans la messagerie de ${r.recipients} utilisateur(s)`, "success"),
    onError: (e: any) => toast.show(e?.message || "Envoi impossible", "error"),
  });
  const del = useMutation({
    mutationFn: () => api(`/evenements/${id}`, { method: "DELETE" }, token),
    onSuccess: () => { toast.show("Événement supprimé", "success"); router.replace("/(app)/evenements"); },
    onError: (e: any) => toast.show(e?.message || "Suppression impossible", "error"),
  });

  const { data: evt, isLoading } = useQuery({
    queryKey: ["evenement", id],
    queryFn: () => api<Evenement>(`/evenements/${id}`, {}, token),
    enabled: !!token && !!id,
  });

  const { data: invs } = useQuery({
    queryKey: ["invitations", id],
    queryFn: () => api<Invitation[]>(`/evenements/${id}/invitations`, {}, token),
    enabled: !!token && !!id,
  });

  if (isLoading || !evt) {
    return (
      <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
    );
  }

  const d = new Date(evt.date);
  const special = invs?.filter(i => i.special).length ?? 0;
  const confirmed = invs?.filter(i => i.status === "confirmed").length ?? 0;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        <ImageBackground source={{ uri: evt.image_url || HERO_IMG }} style={styles.hero}>
          <LinearGradient colors={["rgba(15,23,42,0.15)", "rgba(15,23,42,0.85)"]} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable testID="event-detail-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/evenements"))} style={styles.backBtn}>
              <ChevronLeft size={26} color="#FFF" />
            </Pressable>
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroType}>{eventTypeLabel(evt.type_evenement).toUpperCase()}</Text>
            <Text style={styles.heroTitle}>{evt.titre}</Text>
            <Text style={styles.heroDate}>
              {d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          {!!evt.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.desc}>{evt.description}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détails</Text>
            <View style={styles.detailRow}><View style={styles.keyRow}><MapPin size={14} color={colors.muted} /><Text style={styles.detailKey}>Lieu</Text></View><Text style={styles.detailVal}>{evt.lieu}</Text></View>
            <View style={styles.detailRow}><View style={styles.keyRow}><CalendarDays size={14} color={colors.muted} /><Text style={styles.detailKey}>Date</Text></View><Text style={styles.detailVal}>{d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text></View>
            {!!evt.duree && <View style={styles.detailRow}><View style={styles.keyRow}><Clock size={14} color={colors.muted} /><Text style={styles.detailKey}>Durée</Text></View><Text style={styles.detailVal}>{evt.duree}</Text></View>}
            {!!evt.ville && <View style={styles.detailRow}><Text style={styles.detailKey}>Ville</Text><Text style={styles.detailVal}>{evt.ville}</Text></View>}
            {evt.intervenants.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>Intervenants</Text>
                <Text style={styles.detailVal}>{evt.intervenants.join(", ")}</Text>
              </View>
            )}
          </View>

          {!!evt.horaires && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Horaires & programme</Text>
              <Text style={styles.desc}>{evt.horaires}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actions}>
              <Pressable testID="event-register" onPress={() => router.push(`/inscription?event=${id}&titre=${encodeURIComponent(evt.titre)}`)} style={[styles.actBtn, styles.actPrimary]}>
                <UserPlus size={18} color={colors.onBrandPrimary} />
                <Text style={[styles.actTxt, { color: colors.onBrandPrimary }]}>Je m&apos;inscris</Text>
              </Pressable>
              {canShareEventLink(user?.role) && (
                <Pressable testID="event-copy-link" onPress={copyLink} style={styles.actBtn}>
                  <Link2 size={18} color={colors.brandPrimary} />
                  <Text style={styles.actTxt}>Copier le lien</Text>
                </Pressable>
              )}
              {canSendRappel(user?.role) && (
                <Pressable testID="event-rappel" disabled={rappel.isPending} onPress={() => confirmAction("Envoyer un rappel ?", "Un message sera diffusé à tous les utilisateurs dans la Messagerie (et en notification).", () => rappel.mutate(), "Envoyer")} style={styles.actBtn}>
                  <Bell size={18} color={colors.brandPrimary} />
                  <Text style={styles.actTxt}>{rappel.isPending ? "Envoi…" : "Rappel"}</Text>
                </Pressable>
              )}
              {canManageEvents(user?.role) && (
                <Pressable testID="event-emargement" onPress={() => router.push(`/(app)/event/${id}/hub?titre=${encodeURIComponent(evt.titre)}`)} style={styles.actBtn}>
                  <ClipboardCheck size={18} color={colors.brandPrimary} />
                  <Text style={styles.actTxt}>Émargement & gestion</Text>
                </Pressable>
              )}
              {canAdminEvents(user?.role) && (
                <Pressable testID="event-delete" onPress={() => confirmAction("Supprimer l'événement ?", "Inscrits, séances et pointages seront supprimés.", () => del.mutate())} style={[styles.actBtn, { borderColor: colors.error }]}>
                  <Trash2 size={18} color={colors.error} />
                  <Text style={[styles.actTxt, { color: colors.error }]}>Supprimer</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coordination</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Users size={16} color={colors.muted} />
                <Text style={styles.statNum}>{invs?.length ?? 0}</Text>
                <Text style={styles.statLbl}>Invités</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{confirmed}</Text>
                <Text style={styles.statLbl}>Confirmés</Text>
              </View>
              <View style={[styles.statCard, styles.specialCard]}>
                <Text style={[styles.statNum, { color: colors.brandPrimary }]}>{special}</Text>
                <Text style={styles.statLbl}>Anciens</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {canAdminEvents(user?.role) && (
        <Pressable
          testID="event-invite-elders"
          onPress={() => router.push(`/(app)/evenements/${id}/invite`)}
          style={[styles.stickyCta, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Text style={styles.ctaTxt}>Inviter les anciens</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  keyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { gap: spacing.sm },
  actBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 50, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  actPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  actTxt: { color: colors.brandPrimary, fontWeight: "700", fontSize: 15 },
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: { height: 320, justifyContent: "space-between" },
  heroTop: { paddingHorizontal: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  backTxt: { fontSize: 26, color: colors.onSurface, marginTop: -4 },
  heroContent: { padding: spacing.xl, gap: spacing.xs },
  heroType: { color: "#DBEAFE", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  heroTitle: { color: "#FFFFFF", fontSize: 28, fontWeight: "800" },
  heroDate: { color: "#E2E8F0", fontSize: 13, marginTop: 4 },
  body: { padding: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  desc: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 22 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailKey: { color: colors.muted, fontSize: 13 },
  detailVal: { color: colors.onSurface, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  specialCard: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  statNum: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  statLbl: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stickyCta: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 0,
    backgroundColor: colors.brandPrimary, borderRadius: radius.md,
    paddingTop: spacing.lg, alignItems: "center",
    shadowColor: colors.brandPrimary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  ctaTxt: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700", paddingBottom: spacing.md },
});
