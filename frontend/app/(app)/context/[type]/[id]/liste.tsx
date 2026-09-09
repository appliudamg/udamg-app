import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator,
  RefreshControl, KeyboardAvoidingView, Platform, Linking, Modal, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useAuth } from "@/src/auth";
import {
  api, Contact, CATEGORIES, Categorie, niveauColor, normalize,
  buildRelanceMessage, buildWhatsAppUrl, buildSmsUrl, Ville,
} from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Liste() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const { type, id, nom, categorie, openNew } = useLocalSearchParams<{
    type: "ville" | "programme"; id: string; nom?: string; categorie?: Categorie; openNew?: string;
  }>();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [optionsFor, setOptionsFor] = useState<Contact | null>(null);
  const [relanceFor, setRelanceFor] = useState<Contact | null>(null);
  const [relanceStep, setRelanceStep] = useState<1 | 2>(1);
  const [relanceLvl, setRelanceLvl] = useState<1 | 2 | 3 | 4>(2);
  const [transferFor, setTransferFor] = useState<Contact | null>(null);
  const [selectedDest, setSelectedDest] = useState<string>("");

  const sheetRef = useRef<BottomSheet>(null);

  const q = new URLSearchParams({ context_type: type, context_id: id });
  if (categorie) q.append("categorie", categorie);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["contacts", type, id, categorie],
    queryFn: () => api<Contact[]>(`/contacts?${q.toString()}`, {}, token),
    enabled: !!token && !!id && !!type,
  });

  const { data: villes } = useQuery({
    queryKey: ["villes"],
    queryFn: () => api<Ville[]>("/villes", {}, token),
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const s = normalize(search.trim());
    if (!s) return list;
    return list.filter(c =>
      normalize(`${c.nom} ${c.prenom} ${c.tel ?? ""} ${c.referent}`).includes(s)
    );
  }, [data, search]);

  useEffect(() => {
    if (openNew === "1") {
      setEditing({ id: "", nom: "", prenom: "", tel: "", categorie: (categorie || "GÉDÉON") as Categorie,
        niveau: 1 as any, notes: "", referent: `${user?.prenom} ${user?.nom}`, date_ajout: "",
        context_type: type, context_id: id, enregistre_par: user?.email || "", created_at: "" });
      setTimeout(() => sheetRef.current?.expand(), 100);
    }
  }, [openNew]);

  const openAdd = () => {
    setEditing({ id: "", nom: "", prenom: "", tel: "", categorie: (categorie || "GÉDÉON") as Categorie,
      niveau: 1 as any, notes: "", referent: `${user?.prenom} ${user?.nom}`, date_ajout: "",
      context_type: type, context_id: id, enregistre_par: user?.email || "", created_at: "" });
    sheetRef.current?.expand();
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    sheetRef.current?.expand();
  };

  const saveMut = useMutation({
    mutationFn: (c: Contact) => {
      if (c.id) {
        return api<Contact>(`/contacts/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nom: c.nom, prenom: c.prenom, tel: c.tel,
            categorie: c.categorie, referent: c.referent, niveau: c.niveau, notes: c.notes,
          }),
        }, token);
      }
      return api<Contact>("/contacts", {
        method: "POST",
        body: JSON.stringify({
          nom: c.nom, prenom: c.prenom, tel: c.tel,
          categorie: c.categorie, referent: c.referent, niveau: c.niveau, notes: c.notes,
          context_type: type, context_id: id,
        }),
      }, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", type, id] });
      qc.invalidateQueries({ queryKey: ["contact-stats"] });
      setEditing(null);
      sheetRef.current?.close();
    },
  });

  const relanceMut = useMutation({
    mutationFn: (payload: { cid: string; niveau: number }) =>
      api<Contact>(`/contacts/${payload.cid}/relance`, {
        method: "POST",
        body: JSON.stringify({ niveau: payload.niveau }),
      }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", type, id] });
    },
  });

  const archiveMut = useMutation({
    mutationFn: (cid: string) => api(`/contacts/${cid}/archive`, { method: "POST" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", type, id] }),
  });

  const transferMut = useMutation({
    mutationFn: (payload: { contact_id: string; ville_dest_id: string }) =>
      api("/contacts/transfer", { method: "POST", body: JSON.stringify(payload) }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", type, id] });
      setTransferFor(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (cid: string) => api(`/contacts/${cid}`, { method: "DELETE" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", type, id] }),
  });

  const renderBackdrop = useCallback((props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} pressBehavior="close" />
  ), []);

  const sendRelanceMessage = async (mode: "whatsapp" | "sms") => {
    if (!relanceFor) return;
    // Update level first
    await relanceMut.mutateAsync({ cid: relanceFor.id, niveau: relanceLvl });
    const egliseNom = relanceFor.context_nom || nom || "";
    const wa = villes?.find(v => v.id === relanceFor.context_id)?.whatsapp_link;
    const msg = buildRelanceMessage(relanceFor.prenom, egliseNom, wa, relanceLvl, relanceFor.referent || "notre équipe");
    const tel = relanceFor.tel || "";
    if (!tel) {
      Alert.alert("Erreur", "Numéro de téléphone manquant");
      return;
    }
    const url = mode === "whatsapp" ? buildWhatsAppUrl(tel, msg) : buildSmsUrl(tel, msg);
    try { await Linking.openURL(url); } catch { /* noop */ }
    setRelanceFor(null); setRelanceStep(1);
  };

  const canModify = (c: Contact): boolean => {
    if (!user) return false;
    if (user.role === "pasteur" || user.role === "ouvrier") return true;
    return c.enregistre_par === user.email;
  };

  const canAdmin = user?.role === "pasteur" || user?.role === "ouvrier";
  const canDelete = user?.role === "pasteur";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="liste-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{nom || ""}{categorie ? ` · ${categorie}` : ""}</Text>
          <Text style={styles.title}>{filtered.length} {filtered.length > 1 ? "personnes" : "personne"}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          testID="liste-search"
          placeholder="Rechercher (nom, prénom, téléphone, référent)"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          style={styles.search}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.err}>Erreur de chargement</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryTxt}>Réessayer</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 96, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty} testID="liste-empty">Aucun contact trouvé</Text>}
          renderItem={({ item }) => {
            const nv = niveauColor(item.niveau);
            return (
              <View style={styles.card} testID={`contact-card-${item.id}`}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.nom} {item.prenom}</Text>
                      <View style={[styles.pill, { backgroundColor: nv.bg }]}>
                        <Text style={styles.pillTxt}>Niv {item.niveau}</Text>
                      </View>
                    </View>
                    <View style={styles.tagRow}>
                      <Text style={styles.catTag}>{item.categorie}</Text>
                      <Text style={styles.lvlTag}>{nv.label}</Text>
                    </View>
                    {!!item.tel && <Text style={styles.meta}>📞 {item.tel}</Text>}
                    <Text style={styles.meta}>👤 Référent : {item.referent}</Text>
                    <Text style={styles.meta}>📅 Ajouté le {item.date_ajout}</Text>
                    {!!item.context_nom && type !== ("ville" as any) === false && id === "GLOBAL" && (
                      <Text style={styles.meta}>⛪ {item.context_nom}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.actions}>
                  {!!item.tel && (
                    <>
                      <Pressable
                        testID={`wa-${item.id}`}
                        onPress={() => Linking.openURL(buildWhatsAppUrl(item.tel!))}
                        style={[styles.actionBtn, { backgroundColor: "#25D366" }]}
                      >
                        <Text style={styles.actionTxt}>WA</Text>
                      </Pressable>
                      <Pressable
                        testID={`sms-${item.id}`}
                        onPress={() => Linking.openURL(buildSmsUrl(item.tel!))}
                        style={[styles.actionBtn, { backgroundColor: colors.brandSecondary }]}
                      >
                        <Text style={styles.actionTxt}>SMS</Text>
                      </Pressable>
                    </>
                  )}
                  {canModify(item) && (
                    <Pressable
                      testID={`relance-${item.id}`}
                      onPress={() => { setRelanceFor(item); setRelanceStep(1); setRelanceLvl(Math.min(4, (item.niveau + 1)) as any); }}
                      style={[styles.actionBtn, { backgroundColor: colors.brandPrimary, flex: 1 }]}
                    >
                      <Text style={styles.actionTxt}>Relancer</Text>
                    </Pressable>
                  )}
                  <Pressable
                    testID={`options-${item.id}`}
                    onPress={() => setOptionsFor(item)}
                    style={[styles.actionBtn, { backgroundColor: colors.surfaceTertiary }]}
                  >
                    <Text style={[styles.actionTxt, { color: colors.onSurface }]}>⋯</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <Pressable
        testID="liste-fab"
        onPress={openAdd}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Text style={styles.fabTxt}>+</Text>
      </Pressable>

      {/* ADD / EDIT bottom sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={["80%"]}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
        onClose={() => setEditing(null)}
      >
        <BottomSheetView style={styles.sheetContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <BottomSheetScrollView contentContainerStyle={styles.sheet}>
              <Text style={styles.sheetTitle}>{editing?.id ? "Modifier le contact" : "Nouveau contact"}</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Nom & Prénom</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <TextInput
                    testID="form-prenom"
                    placeholder="Prénom"
                    placeholderTextColor={colors.muted}
                    value={editing?.prenom || ""}
                    onChangeText={t => setEditing(e => e ? { ...e, prenom: t } : e)}
                    style={[styles.input, { flex: 1 }]}
                  />
                  <TextInput
                    testID="form-nom"
                    placeholder="Nom"
                    placeholderTextColor={colors.muted}
                    value={editing?.nom || ""}
                    onChangeText={t => setEditing(e => e ? { ...e, nom: t } : e)}
                    style={[styles.input, { flex: 1 }]}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Téléphone</Text>
                <TextInput
                  testID="form-tel"
                  placeholder="Ex: 0612345678"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  value={editing?.tel || ""}
                  onChangeText={t => setEditing(e => e ? { ...e, tel: t } : e)}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Catégorie</Text>
                <View style={styles.chipRow}>
                  {CATEGORIES.map(cat => (
                    <Pressable
                      key={cat}
                      testID={`form-cat-${cat}`}
                      onPress={() => setEditing(e => e ? { ...e, categorie: cat } : e)}
                      style={[styles.chip, editing?.categorie === cat && styles.chipOn]}
                    >
                      <Text style={[styles.chipTxt, editing?.categorie === cat && styles.chipTxtOn]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Référent</Text>
                <TextInput
                  testID="form-referent"
                  value={editing?.referent || ""}
                  onChangeText={(t) => setEditing(e => e ? { ...e, referent: t } : e)}
                  placeholder="Nom du référent"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Niveau</Text>
                <View style={styles.chipRow}>
                  {[1, 2, 3, 4].map(n => {
                    const nc = niveauColor(n);
                    return (
                      <Pressable
                        key={n}
                        testID={`form-lvl-${n}`}
                        onPress={() => setEditing(e => e ? { ...e, niveau: n as any } : e)}
                        style={[
                          styles.lvlChip,
                          { backgroundColor: editing?.niveau === n ? nc.bg : colors.surfaceSecondary },
                        ]}
                      >
                        <Text style={{ color: editing?.niveau === n ? "#FFF" : colors.onSurface, fontWeight: "700" }}>
                          {n} · {nc.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  testID="form-notes"
                  value={editing?.notes || ""}
                  onChangeText={t => setEditing(e => e ? { ...e, notes: t } : e)}
                  multiline
                  placeholder="Contexte, prières, remarques..."
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                />
              </View>

              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => { setEditing(null); sheetRef.current?.close(); }}
                  style={[styles.btn, styles.btnGrey]}
                  testID="form-close"
                >
                  <Text style={styles.btnGreyTxt}>Fermer</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!editing?.nom || !editing?.prenom) {
                      Alert.alert("Champs manquants", "Nom et prénom obligatoires");
                      return;
                    }
                    saveMut.mutate(editing);
                  }}
                  disabled={saveMut.isPending}
                  style={[styles.btn, styles.btnGreen, saveMut.isPending && { opacity: 0.7 }]}
                  testID="form-save"
                >
                  {saveMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnGreenTxt}>Enregistrer</Text>}
                </Pressable>
              </View>
            </BottomSheetScrollView>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>

      {/* OPTIONS modal */}
      <Modal visible={!!optionsFor} transparent animationType="fade" onRequestClose={() => setOptionsFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setOptionsFor(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Options</Text>
            <Text style={styles.modalSub}>{optionsFor?.prenom} {optionsFor?.nom}</Text>

            {!!optionsFor?.tel && (
              <Pressable
                testID="opt-call"
                onPress={() => { Linking.openURL(`tel:${optionsFor?.tel}`); setOptionsFor(null); }}
                style={[styles.optBtn, { backgroundColor: colors.success }]}
              >
                <Text style={styles.optTxt}>📞 Appeler</Text>
              </Pressable>
            )}
            {optionsFor && canModify(optionsFor) && (
              <Pressable
                testID="opt-edit"
                onPress={() => { const c = optionsFor; setOptionsFor(null); if (c) openEdit(c); }}
                style={[styles.optBtn, { backgroundColor: colors.brandSecondary }]}
              >
                <Text style={styles.optTxt}>✏️ Modifier</Text>
              </Pressable>
            )}
            {canAdmin && type === "ville" && (
              <Pressable
                testID="opt-transfer"
                onPress={() => { const c = optionsFor; setOptionsFor(null); setTransferFor(c); }}
                style={[styles.optBtn, { backgroundColor: colors.warning }]}
              >
                <Text style={styles.optTxt}>🔀 Transférer vers une autre église</Text>
              </Pressable>
            )}
            {canAdmin && (
              <Pressable
                testID="opt-archive"
                onPress={() => {
                  const c = optionsFor;
                  setOptionsFor(null);
                  if (c) archiveMut.mutate(c.id);
                }}
                style={[styles.optBtn, { backgroundColor: colors.surfaceInverse }]}
              >
                <Text style={[styles.optTxt, { color: colors.onSurfaceInverse }]}>📚 Archiver (Passer en Ancien)</Text>
              </Pressable>
            )}
            {canDelete && (
              <Pressable
                testID="opt-delete"
                onPress={() => {
                  const c = optionsFor;
                  setOptionsFor(null);
                  if (c) {
                    Alert.alert("Confirmer", `Supprimer définitivement ${c.prenom} ${c.nom} ?`, [
                      { text: "Annuler", style: "cancel" },
                      { text: "Supprimer", style: "destructive", onPress: () => deleteMut.mutate(c.id) },
                    ]);
                  }
                }}
                style={[styles.optBtn, { backgroundColor: colors.error }]}
              >
                <Text style={styles.optTxt}>🗑 Supprimer définitivement</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setOptionsFor(null)} style={[styles.optBtn, styles.optClose]}>
              <Text style={styles.btnGreyTxt}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* RELANCE modal */}
      <Modal visible={!!relanceFor} transparent animationType="fade" onRequestClose={() => setRelanceFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setRelanceFor(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Relancer</Text>
            <Text style={styles.modalSub}>{relanceFor?.prenom} {relanceFor?.nom}</Text>

            {relanceStep === 1 ? (
              <>
                <Text style={styles.label}>Nouveau niveau</Text>
                <View style={styles.chipRow}>
                  {[1, 2, 3, 4].map(n => {
                    const nc = niveauColor(n);
                    return (
                      <Pressable
                        key={n}
                        testID={`relance-lvl-${n}`}
                        onPress={() => setRelanceLvl(n as any)}
                        style={[styles.lvlChip, { backgroundColor: relanceLvl === n ? nc.bg : colors.surfaceSecondary }]}
                      >
                        <Text style={{ color: relanceLvl === n ? "#FFF" : colors.onSurface, fontWeight: "700" }}>
                          {n} · {nc.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.modalRow}>
                  <Pressable onPress={() => setRelanceFor(null)} style={[styles.btn, styles.btnGrey]}>
                    <Text style={styles.btnGreyTxt}>Retour</Text>
                  </Pressable>
                  <Pressable onPress={() => setRelanceStep(2)} style={[styles.btn, styles.btnPrimary]} testID="relance-next">
                    <Text style={styles.btnPrimaryTxt}>Suivant →</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Mode d'envoi</Text>
                <Pressable
                  testID="relance-wa"
                  onPress={() => sendRelanceMessage("whatsapp")}
                  style={[styles.optBtn, { backgroundColor: "#25D366" }]}
                >
                  <Text style={styles.optTxt}>💬 Via WhatsApp</Text>
                </Pressable>
                <Pressable
                  testID="relance-sms"
                  onPress={() => sendRelanceMessage("sms")}
                  style={[styles.optBtn, { backgroundColor: colors.brandSecondary }]}
                >
                  <Text style={styles.optTxt}>📱 Via SMS</Text>
                </Pressable>
                <View style={styles.modalRow}>
                  <Pressable onPress={() => setRelanceStep(1)} style={[styles.btn, styles.btnGrey]}>
                    <Text style={styles.btnGreyTxt}>← Retour</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* TRANSFER modal */}
      <Modal visible={!!transferFor} transparent animationType="fade" onRequestClose={() => setTransferFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setTransferFor(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Transférer</Text>
            <Text style={styles.modalSub}>{transferFor?.prenom} {transferFor?.nom}</Text>
            <Text style={styles.label}>Église de destination</Text>
            <View style={{ gap: spacing.sm, maxHeight: 260 }}>
              <FlatList
                data={(villes || []).filter(v => v.id !== transferFor?.context_id)}
                keyExtractor={(v) => v.id}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`transfer-dest-${item.id}`}
                    onPress={() => setSelectedDest(item.id)}
                    style={[styles.destRow, selectedDest === item.id && styles.destRowOn]}
                  >
                    <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{item.nom}</Text>
                    {selectedDest === item.id && <Text style={{ color: colors.brandPrimary }}>✓</Text>}
                  </Pressable>
                )}
              />
            </View>
            <View style={styles.modalRow}>
              <Pressable onPress={() => setTransferFor(null)} style={[styles.btn, styles.btnGrey]}>
                <Text style={styles.btnGreyTxt}>Fermer</Text>
              </Pressable>
              <Pressable
                testID="transfer-submit"
                disabled={!selectedDest || transferMut.isPending}
                onPress={() => transferMut.mutate({ contact_id: transferFor!.id, ville_dest_id: selectedDest })}
                style={[styles.btn, { backgroundColor: colors.warning }, (!selectedDest || transferMut.isPending) && { opacity: 0.5 }]}
              >
                {transferMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryTxt}>Valider le transfert</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  searchWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  search: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.border, color: colors.onSurface, minHeight: 48,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: "row" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  name: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillTxt: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  tagRow: { flexDirection: "row", gap: spacing.xs, marginTop: 4 },
  catTag: { backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "700", overflow: "hidden" },
  lvlTag: { backgroundColor: colors.surfaceTertiary, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontSize: 11, fontWeight: "600", overflow: "hidden" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  actions: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  actionBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 40, minWidth: 52 },
  actionTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  fab: {
    position: "absolute", right: spacing.xl, width: 60, height: 60, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: colors.brandPrimary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  fabTxt: { color: colors.onBrandPrimary, fontSize: 32, fontWeight: "300", marginTop: -4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  err: { color: colors.error },
  retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md },
  retryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  sheetContainer: { flex: 1 },
  sheet: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  field: { gap: spacing.xs },
  label: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 16, minHeight: 52,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtOn: { color: colors.onBrandPrimary },
  lvlChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 50 },
  btnGrey: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnGreyTxt: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  btnGreen: { backgroundColor: colors.success },
  btnGreenTxt: { color: "#FFFFFF", fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, maxHeight: "85%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  modalSub: { color: colors.muted, fontSize: 13 },
  modalRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  optBtn: { padding: spacing.md, borderRadius: radius.md, alignItems: "center", minHeight: 48, justifyContent: "center" },
  optTxt: { color: "#FFF", fontWeight: "700" },
  optClose: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  destRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  destRowOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
});
