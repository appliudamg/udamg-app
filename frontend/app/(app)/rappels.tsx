import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Linking, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, Contact, buildWhatsAppUrl, buildSmsUrl, buildRelanceMessage, Ville } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Rappels() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [days, setDays] = useState<number>(7);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["rappels", days],
    queryFn: () => api<Contact[]>(`/rappels?days=${days}`, {}, token),
    enabled: !!token,
  });

  const { data: villes } = useQuery({
    queryKey: ["villes"],
    queryFn: () => api<Ville[]>("/villes", {}, token),
    enabled: !!token,
  });

  const items = data ?? [];

  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);

  const relance = (c: Contact, mode: "whatsapp" | "sms") => {
    if (!c.tel) return;
    const wa = villes?.find(v => v.id === c.context_id)?.whatsapp_link;
    const msg = buildRelanceMessage(c.prenom, c.context_nom || "", wa);
    Linking.openURL(mode === "whatsapp" ? buildWhatsAppUrl(c.tel, msg) : buildSmsUrl(c.tel, msg));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="rappels-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ACCOMPAGNEMENT</Text>
          <Text style={styles.title}>Rappels automatiques</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <Text style={styles.filterLabel}>Stagnants depuis :</Text>
        {[3, 7, 14, 30].map(d => (
          <Pressable
            key={d}
            testID={`rappels-days-${d}`}
            onPress={() => setDays(d)}
            style={[styles.chip, days === d && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, days === d && styles.chipTxtOn]}>{d} j</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTxt}>
          <Text style={styles.summaryNum}>{items.length}</Text> âme{items.length > 1 ? "s" : ""} à relancer
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTxt}>Aucun rappel en attente</Text>
              <Text style={styles.emptySub}>Tous les contacts ont progressé récemment</Text>
            </View>
          }
          renderItem={({ item }) => {
            const d = daysSince(item.created_at);
            return (
              <View style={styles.card} testID={`rappel-${item.id}`}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.nom} {item.prenom}</Text>
                    <Text style={styles.meta}>{item.categorie} · {item.context_nom}</Text>
                    {!!item.tel && <Text style={styles.meta}>📞 {item.tel}</Text>}
                    <Text style={styles.meta}>Référent : {item.referent}</Text>
                  </View>
                  <View style={styles.stagnantBadge}>
                    <Text style={styles.stagnantNum}>{d}</Text>
                    <Text style={styles.stagnantLbl}>jours</Text>
                  </View>
                </View>
                {!!item.tel && (
                  <View style={styles.actions}>
                    <Pressable
                      testID={`rappel-wa-${item.id}`}
                      onPress={() => relance(item, "whatsapp")}
                      style={[styles.actionBtn, { backgroundColor: "#25D366" }]}
                    >
                      <Text style={styles.actionTxt}>💬 WhatsApp</Text>
                    </Pressable>
                    <Pressable
                      testID={`rappel-sms-${item.id}`}
                      onPress={() => relance(item, "sms")}
                      style={[styles.actionBtn, { backgroundColor: colors.brandSecondary }]}
                    >
                      <Text style={styles.actionTxt}>📱 SMS</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
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
  filterBar: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexWrap: "wrap" },
  filterLabel: { color: colors.muted, fontSize: 13, marginRight: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  chipTxtOn: { color: colors.onBrandPrimary },
  summary: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  summaryTxt: { color: colors.muted, fontSize: 14 },
  summaryNum: { color: colors.brandPrimary, fontWeight: "800", fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 16 },
  emptySub: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: "row", gap: spacing.md },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  stagnantBadge: { alignItems: "center", justifyContent: "center", backgroundColor: colors.error, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 56 },
  stagnantNum: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  stagnantLbl: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", opacity: 0.9 },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.md, alignItems: "center", minHeight: 40, justifyContent: "center" },
  actionTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
});
