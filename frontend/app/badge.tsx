import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/src/api";
import { EventParticipant, profilColor } from "@/src/event-api";
import { colors, spacing, radius } from "@/src/theme";

export default function Badge() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { event, b } = useLocalSearchParams<{ event: string; b: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["badge", event, b],
    queryFn: () => api<EventParticipant>(`/event/participants/by-badge/${b}?evenement_id=${event}`),
    enabled: !!event && !!b,
  });

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (isError || !data) return (
    <View style={styles.center}>
      <Text style={styles.errTxt}>Badge introuvable</Text>
      <Pressable onPress={() => router.back()} style={styles.linkBtn}>
        <Text style={styles.linkTxt}>← Retour</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Pressable testID="badge-back" onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>

        <View style={styles.card} testID="badge-card">
          <View style={styles.top}>
            <Text style={styles.brand}>UDAMG</Text>
            <Text style={styles.tagline}>PASS OFFICIEL</Text>
          </View>

          <View style={styles.qrWrap}>
            <View style={styles.qrBox}>
              <QRCode value={data.badge_id} size={180} color={colors.brandPrimary} backgroundColor="#FFFFFF" />
            </View>
          </View>

          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>{data.prenom}</Text>
            <Text style={styles.nameSecond} numberOfLines={1}>{data.nom}</Text>
            <View style={[styles.profilTag, { backgroundColor: profilColor(data.profil) }]}>
              <Text style={styles.profilTagTxt}>{data.profil}</Text>
            </View>
            <Text style={styles.badgeId} testID="badge-id">{data.badge_id}</Text>
            {!!data.eglise && <Text style={styles.eglise}>{data.eglise}</Text>}
          </View>

          <View style={styles.bottomStrip}>
            <Text style={styles.stripTxt}>Sauvé par Grâce pour Sauver</Text>
          </View>
        </View>

        <Text style={styles.hint}>Présentez ce badge à l'entrée pour être scanné.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  wrap: { alignItems: "center", padding: spacing.xl, gap: spacing.lg, flexGrow: 1, justifyContent: "center" },
  close: { position: "absolute", top: spacing.md, right: spacing.md, width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  closeTxt: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  card: {
    width: 320, minHeight: 470, borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 4, borderColor: "#D4A017",
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 14,
  },
  top: { backgroundColor: colors.brandPrimary, padding: spacing.lg, alignItems: "center" },
  brand: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", letterSpacing: 4 },
  tagline: { color: "#DBEAFE", fontSize: 11, fontWeight: "700", letterSpacing: 3, marginTop: 4 },
  qrWrap: { alignItems: "center", padding: spacing.lg },
  qrBox: { padding: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: "#D4A017", backgroundColor: "#FFFFFF" },
  identity: { alignItems: "center", padding: spacing.md, gap: 4 },
  name: { fontSize: 24, fontWeight: "900", color: colors.onSurface, textTransform: "capitalize" },
  nameSecond: { fontSize: 20, fontWeight: "800", color: colors.onSurface, textTransform: "uppercase", letterSpacing: 1 },
  profilTag: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, marginTop: 4 },
  profilTagTxt: { color: "#FFFFFF", fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  badgeId: { fontSize: 18, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 2, marginTop: 4 },
  eglise: { fontSize: 12, color: colors.muted, marginTop: 2 },
  bottomStrip: { marginTop: "auto", padding: spacing.sm, backgroundColor: "#D4A017", alignItems: "center" },
  stripTxt: { color: "#FFFFFF", fontWeight: "800", fontSize: 12, fontStyle: "italic", letterSpacing: 1 },
  hint: { color: "#FFFFFF", opacity: 0.7, fontSize: 12, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInverse, gap: spacing.md },
  errTxt: { color: "#FFFFFF" },
  linkBtn: { padding: spacing.md },
  linkTxt: { color: "#FFFFFF" },
});
