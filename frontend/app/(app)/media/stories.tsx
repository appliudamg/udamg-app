import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { X, Trash2, Eye } from "lucide-react-native";
import { api, Story } from "@/src/api";
import { useAuth } from "@/src/auth";
import { canWriteMedia } from "@/src/roles";
import { confirmAction } from "@/src/confirm";
import { mediaTheme } from "@/src/media_theme";

const IMAGE_MS = 6000;

function StoryVideo({ url, onEnd, paused }: { url: string; onEnd: () => void; paused: boolean }) {
  const player = useVideoPlayer({ uri: url }, (p) => { p.loop = false; });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    if (status === "readyToPlay" && !paused) player.play();
    if (status === "error") onEnd();
  }, [status, paused, player, onEnd]);
  useEffect(() => { if (paused) player.pause(); else if (status === "readyToPlay") player.play(); }, [paused, player, status]);
  useEffect(() => {
    const sub = player.addListener("playToEnd", onEnd);
    return () => sub.remove();
  }, [player, onEnd]);
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls={false} playsInline />;
}

export default function StoriesViewer() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, token } = useAuth();
  const canManage = canWriteMedia(user?.role);

  const stories = useQuery({ queryKey: ["stories"], queryFn: () => api<Story[]>("/stories", {}, token), enabled: !!token });
  const list = useMemo(() => stories.data ?? [], [stories.data]);
  const [index, setIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (index === null && list.length) {
      const i = list.findIndex((s) => s.id === start);
      setIndex(i >= 0 ? i : 0);
    }
  }, [list, start, index]);

  const current = index !== null ? list[index] : undefined;

  const markView = useMutation({
    mutationFn: (id: string) => api(`/stories/${id}/view`, { method: "POST" }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stories"] }),
  });
  useEffect(() => { if (current && !current.viewed) markView.mutate(current.id); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => router.back(), [router]);
  const next = useCallback(() => {
    if (index === null) return;
    if (index + 1 < list.length) { setIndex(index + 1); setProgress(0); } else close();
  }, [index, list.length, close]);
  const prev = useCallback(() => {
    if (index === null) return;
    if (index > 0) { setIndex(index - 1); setProgress(0); } else setProgress(0);
  }, [index]);

  // Progression automatique pour les images
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!current || current.kind !== "image" || paused) return;
    const startedAt = Date.now() - progress * IMAGE_MS;
    timer.current = setInterval(() => {
      const p = (Date.now() - startedAt) / IMAGE_MS;
      if (p >= 1) { clearInterval(timer.current!); next(); } else setProgress(p);
    }, 50);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [current?.id, paused, next]); // eslint-disable-line react-hooks/exhaustive-deps

  const del = useMutation({
    mutationFn: (id: string) => api(`/stories/${id}`, { method: "DELETE" }, token),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stories"] }); close(); },
  });

  const viewers = useQuery({
    queryKey: ["stories", "viewers", current?.id],
    queryFn: () => api<{ name: string; role: string }[]>(`/stories/${current!.id}/viewers`, {}, token),
    enabled: !!token && !!current && canManage,
  });

  if (!current) {
    return <View style={styles.root}><ActivityIndicator color={mediaTheme.gold} style={{ marginTop: 120 }} /></View>;
  }
  const width = Dimensions.get("window").width;

  return (
    <View style={styles.root} testID="stories-viewer">
      {current.kind === "image" ? (
        <Image source={{ uri: current.url! }} style={styles.media} resizeMode="contain" />
      ) : (
        <StoryVideo key={current.id} url={current.url!} onEnd={next} paused={paused} />
      )}

      {/* Zones tactiles : gauche = précédent, droite = suivant, appui long = pause */}
      <View style={styles.tapZones}>
        <Pressable testID="story-prev" style={{ flex: 1 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        <Pressable testID="story-next" style={{ flex: 2 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {list.map((s, i) => (
            <View key={s.id} style={styles.barBg}>
              <View style={[styles.barFill, { width: i < index! ? "100%" : i === index ? (current.kind === "image" ? `${Math.round(progress * 100)}%` : "100%") : "0%" }]} />
            </View>
          ))}
        </View>
        <View style={styles.meta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{current.author_name || "UDAMG"}</Text>
            <Text style={styles.time}>{new Date(current.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
          {canManage && (
            <Pressable testID="story-delete" onPress={() => confirmAction("Supprimer cette story ?", "Elle disparaîtra pour tout le monde.", () => del.mutate(current.id))} style={styles.iconBtn}>
              <Trash2 size={20} color="#FFF" />
            </Pressable>
          )}
          <Pressable testID="story-close" onPress={close} style={styles.iconBtn}><X size={24} color="#FFF" /></Pressable>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16, width }]} pointerEvents="box-none">
        {!!current.caption && <Text style={styles.caption}>{current.caption}</Text>}
        {canManage && (
          <View style={styles.viewsRow}>
            <Eye size={14} color={mediaTheme.textMuted} />
            <Text style={styles.views}>
              {viewers.data?.length ?? current.views_count} vue{(viewers.data?.length ?? current.views_count) > 1 ? "s" : ""}
              {viewers.data && viewers.data.length > 0 ? ` · ${viewers.data.slice(0, 3).map((v) => v.name).join(", ")}${viewers.data.length > 3 ? "…" : ""}` : ""}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  media: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" },
  tapZones: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 10 },
  bars: { flexDirection: "row", gap: 4 },
  barBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  barFill: { height: 3, backgroundColor: "#FFF" },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  author: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "rgba(0,0,0,0.35)" },
  bottom: { position: "absolute", bottom: 0, left: 0, paddingHorizontal: 20, gap: 8 },
  caption: { color: "#FFF", fontSize: 16, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  viewsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  views: { color: mediaTheme.textMuted, fontSize: 12 },
});
