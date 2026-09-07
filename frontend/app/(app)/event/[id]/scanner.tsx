import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, ScrollView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { api } from "@/src/api";
import { EventDashboard, EventParticipant } from "@/src/event-api";
import { colors, spacing, radius } from "@/src/theme";

type ScanResult = {
  kind: "ok" | "already" | "error";
  message: string;
  participant?: EventParticipant | null;
  at: string;
};

export default function Scanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const toast = useToast();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState("");
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const cooldown = useRef<number>(0);

  const { data: dash } = useQuery({
    queryKey: ["event-dashboard", id],
    queryFn: () => api<EventDashboard>(`/event/dashboard?evenement_id=${id}`, {}, token),
    enabled: !!token && !!id,
    refetchInterval: 5000,
  });

  const activeSession = dash?.active_session;
  const scannerLocked = !activeSession;

  const scanMut = useMutation({
    mutationFn: (badge_id: string) =>
      api<{ status: "ok" | "already"; participant: EventParticipant; session_nom: string; timestamp?: string }>(
        "/event/pointages", {
          method: "POST",
          body: JSON.stringify({ evenement_id: id, badge_id }),
        }, token),
    onSuccess: (r) => {
      const kind = r.status === "ok" ? "ok" : "already";
      const message = kind === "ok"
        ? `Bienvenue ${r.participant.prenom} ${r.participant.nom}`
        : `${r.participant.prenom} ${r.participant.nom} déjà pointé`;
      const item: ScanResult = { kind, message, participant: r.participant, at: new Date().toLocaleTimeString("fr-FR") };
      setLastResult(item);
      setHistory((h) => [item, ...h].slice(0, 10));
      toast.show(message, kind === "ok" ? "success" : "info");
    },
    onError: (e: any) => {
      const item: ScanResult = { kind: "error", message: e?.message || "Erreur", at: new Date().toLocaleTimeString("fr-FR") };
      setLastResult(item);
      setHistory((h) => [item, ...h].slice(0, 10));
      toast.show(item.message, "error");
    },
  });

  const submitBadge = (raw: string) => {
    if (!raw) return;
    // Only accept EBED-XXXX pattern
    const match = raw.match(/EBED-\d{4}/i);
    const badge = (match ? match[0] : raw).toUpperCase();
    if (scannerLocked) {
      toast.show("Aucune séance active — scanner verrouillé", "error");
      return;
    }
    scanMut.mutate(badge);
  };

  const onBarcode = (event: any) => {
    if (paused || scannerLocked) return;
    const now = Date.now();
    if (now - cooldown.current < 1500) return;
    cooldown.current = now;
    submitBadge(event?.data || "");
  };

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const showCamera = Platform.OS !== "web" && permission?.granted && !paused;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="scanner-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{titre || ""}</Text>
          <Text style={styles.title}>Scanner de pointage</Text>
        </View>
        <Pressable
          testID="scanner-toggle-facing"
          onPress={() => setFacing(f => f === "back" ? "front" : "back")}
          style={styles.iconBtn}
        >
          <Text style={styles.iconBtnTxt}>🔄</Text>
        </Pressable>
      </View>

      <View style={[styles.status, scannerLocked ? styles.statusOff : styles.statusOn]}>
        <Text style={styles.statusTxt}>
          {scannerLocked ? "⚠️ Aucune séance active" : `● Séance : ${activeSession?.nom}`}
        </Text>
      </View>

      <View style={styles.cameraWrap} testID="scanner-camera-wrap">
        {Platform.OS === "web" ? (
          <View style={styles.webCamera}>
            <Text style={styles.webCameraIcon}>📷</Text>
            <Text style={styles.webCameraTxt}>Scanner caméra désactivé sur le preview web.</Text>
            <Text style={styles.webCameraSub}>Utilisez la saisie manuelle ci-dessous ou l'app Expo Go.</Text>
          </View>
        ) : !permission ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : !permission.granted ? (
          <View style={styles.permWrap}>
            <Text style={styles.permIcon}>📷</Text>
            <Text style={styles.permTxt}>Autorisez la caméra pour scanner</Text>
            <Pressable onPress={requestPermission} style={styles.permBtn}>
              <Text style={styles.permBtnTxt}>Autoriser</Text>
            </Pressable>
          </View>
        ) : showCamera ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39"] }}
            onBarcodeScanned={onBarcode}
          />
        ) : (
          <View style={styles.webCamera}>
            <Text style={styles.webCameraIcon}>⏸</Text>
            <Text style={styles.webCameraTxt}>Scanner en pause</Text>
          </View>
        )}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable testID="scanner-pause" onPress={() => setPaused(p => !p)} style={styles.controlBtn}>
          <Text style={styles.controlTxt}>{paused ? "▶ Reprendre" : "⏸ Pause"}</Text>
        </Pressable>
      </View>

      <View style={styles.manualBox}>
        <Text style={styles.manualLabel}>Saisie manuelle du badge</Text>
        <View style={styles.manualRow}>
          <TextInput
            testID="scanner-manual-input"
            value={manual}
            onChangeText={setManual}
            placeholder="EBED-0001"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={styles.manualInput}
          />
          <Pressable
            testID="scanner-manual-submit"
            onPress={() => { submitBadge(manual); setManual(""); }}
            disabled={!manual || scannerLocked || scanMut.isPending}
            style={[styles.manualBtn, (!manual || scannerLocked || scanMut.isPending) && { opacity: 0.5 }]}
          >
            {scanMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.manualBtnTxt}>Valider</Text>}
          </Pressable>
        </View>
      </View>

      {lastResult && (
        <View style={[styles.result,
          lastResult.kind === "ok" ? styles.resultOk :
          lastResult.kind === "already" ? styles.resultAlready : styles.resultErr]}
        testID="scanner-last-result">
          <Text style={styles.resultIcon}>
            {lastResult.kind === "ok" ? "✓" : lastResult.kind === "already" ? "⚠" : "✕"}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.resultMsg}>{lastResult.message}</Text>
            {lastResult.participant && (
              <Text style={styles.resultBadge}>{lastResult.participant.badge_id} · {lastResult.participant.profil}</Text>
            )}
          </View>
        </View>
      )}

      <View style={styles.history}>
        <Text style={styles.historyTitle}>Derniers scans</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md, gap: 6 }}>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>Aucun scan pour l'instant</Text>
          ) : (
            history.map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text style={styles.historyKind}>
                  {h.kind === "ok" ? "✓" : h.kind === "already" ? "⚠" : "✕"}
                </Text>
                <Text style={styles.historyMsg} numberOfLines={1}>{h.message}</Text>
                <Text style={styles.historyTime}>{h.at}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  backTxt: { fontSize: 28, color: colors.onSurface, marginTop: -4 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  iconBtnTxt: { fontSize: 18 },
  status: { marginHorizontal: spacing.xl, padding: spacing.sm, borderRadius: radius.md, alignItems: "center" },
  statusOn: { backgroundColor: colors.success },
  statusOff: { backgroundColor: colors.warning },
  statusTxt: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  cameraWrap: { margin: spacing.xl, height: 260, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  webCamera: { alignItems: "center", justifyContent: "center", gap: 8, padding: spacing.xl },
  webCameraIcon: { fontSize: 44 },
  webCameraTxt: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
  webCameraSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center" },
  permWrap: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  permIcon: { fontSize: 44 },
  permTxt: { color: "#FFFFFF", fontWeight: "700" },
  permBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.md, marginTop: spacing.xs },
  permBtnTxt: { color: "#FFFFFF", fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: 180, height: 180, borderColor: "rgba(255,255,255,0.9)", borderWidth: 3, borderRadius: radius.md },
  controls: { flexDirection: "row", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  controlBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  controlTxt: { color: colors.onSurface, fontWeight: "700" },
  manualBox: { paddingHorizontal: spacing.xl, gap: spacing.xs, marginBottom: spacing.sm },
  manualLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  manualRow: { flexDirection: "row", gap: spacing.sm },
  manualInput: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.onSurface, minHeight: 48 },
  manualBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minWidth: 88 },
  manualBtnTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  result: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, marginHorizontal: spacing.xl, borderRadius: radius.md },
  resultOk: { backgroundColor: colors.success },
  resultAlready: { backgroundColor: colors.warning },
  resultErr: { backgroundColor: colors.error },
  resultIcon: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  resultMsg: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  resultBadge: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
  history: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.xs },
  historyTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  historyEmpty: { color: colors.muted, fontStyle: "italic", fontSize: 12 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  historyKind: { fontSize: 14, fontWeight: "800" },
  historyMsg: { flex: 1, color: colors.onSurface, fontSize: 13 },
  historyTime: { color: colors.muted, fontSize: 11 },
});
