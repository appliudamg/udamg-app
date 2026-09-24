import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, Modal, ScrollView, PanResponder,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayer, SleepTimerMode } from "@/src/player";
import { mediaTheme, initialsOf, categoryHue, kindLabel } from "@/src/media_theme";
import { mediaCoverUrl, mediaFileUrl, fmtDuration } from "@/src/api";
import { useAuth } from "@/src/auth";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { Heart, Moon, Pause, Play } from "lucide-react-native";

const RATES = [0.75, 1, 1.25, 1.5, 2];

export function PlayerModal() {
  const insets = useSafeAreaInsets();
  const p = usePlayer();
  const { token } = useAuth();
  const [tab, setTab] = useState<"cover" | "script">("cover");
  const [showSleep, setShowSleep] = useState(false);

  if (!p.current) return null;

  const item = p.current;
  const coverUri = mediaCoverUrl(item);
  const hue = categoryHue[item.category] || mediaTheme.violetDeep;
  const isFav = p.isFavorite(item.id);
  const pct = p.durationSec > 0 ? p.positionSec / p.durationSec : 0;
  const isVideo = item.kind === "video" && !!item.audio_path && !!token;

  return (
    <Modal
      visible={p.playerVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={p.closePlayer}
      statusBarTranslucent
    >
      {isVideo ? (
        <VideoScreen url={item.stream_url || mediaFileUrl(item.id, token!)} item={item} onClose={p.closePlayer} isFav={isFav} onFav={() => p.toggleFavorite(item.id).catch(() => {})} />
      ) : (
      <View style={styles.root}>
        <LinearGradient
          colors={[hue, mediaTheme.bg]}
          style={StyleSheet.absoluteFillObject}
          locations={[0, 0.6]}
        />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable testID="player-close" onPress={p.closePlayer} hitSlop={12}>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>
          <View>
            <Text style={styles.eyebrow}>{kindLabel[item.kind] || "Audio"}</Text>
            <Text style={styles.headerTitle}>Écoute en cours</Text>
          </View>
          <Pressable testID="player-fav" onPress={() => p.toggleFavorite(item.id).catch(() => {})} hitSlop={12}>
            <Heart size={28} color={isFav ? mediaTheme.ruby : mediaTheme.textMuted} fill={isFav ? mediaTheme.ruby : "transparent"} />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {(["cover", "script"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
                {t === "cover" ? "Pochette" : "Script / Notes"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "cover" ? (
          <View style={styles.artWrap}>
            <View style={[styles.art, { backgroundColor: hue }]}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.artImg} resizeMode="cover" />
              ) : (
                <Text style={styles.artInitials}>{initialsOf(item.title)}</Text>
              )}
            </View>
          </View>
        ) : (
          <ScrollView style={styles.scriptWrap} contentContainerStyle={{ padding: 20, paddingBottom: 260 }}>
            <Text style={styles.scriptTitle}>{item.title}</Text>
            <Text style={styles.scriptAuthor}>{item.author}</Text>
            <Text style={styles.scriptTxt}>
              {item.transcript || item.description || "Aucun script disponible pour ce média."}
            </Text>
          </ScrollView>
        )}

        <View style={styles.bottom}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.author}>{item.author}</Text>

          <ProgressBar pct={pct} onScrub={(x) => p.seek(x * p.durationSec)} />
          <View style={styles.timeRow}>
            <Text style={styles.time}>{fmtDuration(p.positionSec)}</Text>
            <Text style={styles.time}>{fmtDuration(p.durationSec || item.duration)}</Text>
          </View>

          {!item.audio_path && (
            <View style={styles.noAudio}>
              <Text style={styles.noAudioTxt}>
                Ce média n&apos;a pas encore de fichier audio. La console admin permet d&apos;en uploader un.
              </Text>
            </View>
          )}

          <View style={styles.controls}>
            <Pressable testID="player-prev" onPress={p.prev} hitSlop={12}>
              <Text style={styles.ctrlIcon}>⏮</Text>
            </Pressable>
            <Pressable testID="player-back10" onPress={() => p.seekBy(-10)} hitSlop={12} style={styles.jumpBtn}>
              <Text style={styles.jumpTxt}>−10</Text>
            </Pressable>
            <Pressable testID="player-toggle" onPress={p.toggle} style={styles.playBtn}>
              {p.isPlaying ? <Pause size={26} color="#000" fill="#000" /> : <Play size={26} color="#000" fill="#000" />}
            </Pressable>
            <Pressable testID="player-fwd10" onPress={() => p.seekBy(10)} hitSlop={12} style={styles.jumpBtn}>
              <Text style={styles.jumpTxt}>+10</Text>
            </Pressable>
            <Pressable testID="player-next" onPress={p.next} hitSlop={12}>
              <Text style={styles.ctrlIcon}>⏭</Text>
            </Pressable>
          </View>

          <View style={styles.extraRow}>
            <RateBtn value={p.playbackRate} onCycle={() => {
              const idx = RATES.indexOf(p.playbackRate as any);
              const next = RATES[(idx + 1) % RATES.length];
              p.setRate(next);
            }} />
            <Pressable
              testID="player-sleep"
              onPress={() => setShowSleep(true)}
              style={styles.extraBtn}
            >
              <Moon size={16} color={mediaTheme.text} />
              <Text style={styles.extraTxt}>
                {p.sleepRemainingSec ? `${Math.ceil(p.sleepRemainingSec / 60)} min` : "Sommeil"}
              </Text>
            </Pressable>
          </View>
        </View>

        <SleepPicker
          visible={showSleep}
          onClose={() => setShowSleep(false)}
          current={p.sleepTimer}
          onPick={(m) => { p.setSleepTimer(m); setShowSleep(false); }}
        />
      </View>
      )}
    </Modal>
  );
}

// ---- Video screen (used when kind=video) ---- //
function VideoScreen({
  url, item, onClose, isFav, onFav,
}: {
  url: string;
  item: any;
  onClose: () => void;
  isFav: boolean;
  onFav: () => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });

  return (
    <View style={videoStyles.root}>
      <View style={[videoStyles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="video-close" onPress={onClose} hitSlop={12} style={videoStyles.iconBtn}>
          <Text style={videoStyles.icon}>⌄</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={videoStyles.eyebrow}>VIDÉO</Text>
          <Text style={videoStyles.title} numberOfLines={1}>{item.title}</Text>
        </View>
        <Pressable testID="video-fav" onPress={onFav} hitSlop={12} style={videoStyles.iconBtn}>
          <Heart size={26} color={isFav ? mediaTheme.ruby : "#FFF"} fill={isFav ? mediaTheme.ruby : "transparent"} />
        </Pressable>
      </View>
      <VideoView
        style={videoStyles.player}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
      />
      <View style={videoStyles.meta}>
        <Text style={videoStyles.metaTitle}>{item.title}</Text>
        <Text style={videoStyles.metaAuthor}>{item.author}</Text>
        {!!item.description && <Text style={videoStyles.metaDesc}>{item.description}</Text>}
      </View>
    </View>
  );
}

const videoStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  icon: { color: "#FFF", fontSize: 28 },
  eyebrow: { color: mediaTheme.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  meta: { padding: 20, gap: 6 },
  metaTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  metaAuthor: { color: mediaTheme.gold, fontSize: 13 },
  metaDesc: { color: mediaTheme.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
});

// ---- Progress bar (tap to seek) ---- //
function ProgressBar({ pct, onScrub }: { pct: number; onScrub: (f: number) => void }) {
  const [width, setWidth] = useState(1);
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (e) => {
      const x = Math.max(0, Math.min(width, e.nativeEvent.locationX));
      onScrub(width > 0 ? x / width : 0);
    },
  });
  return (
    <View
      style={pbStyles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
      testID="player-progress"
    >
      <View style={[pbStyles.fill, { width: `${Math.min(100, Math.max(0, pct * 100))}%` }]} />
      <View style={[pbStyles.knob, { left: `${Math.min(100, Math.max(0, pct * 100))}%` }]} />
    </View>
  );
}
const pbStyles = StyleSheet.create({
  track: { height: 20, justifyContent: "center", marginTop: 8 },
  fill: { position: "absolute", left: 0, top: 9, height: 3, backgroundColor: mediaTheme.gold, borderRadius: 2 },
  knob: {
    position: "absolute", top: 5, width: 12, height: 12, borderRadius: 6,
    backgroundColor: mediaTheme.gold, marginLeft: -6,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 3 } }),
  },
});

function RateBtn({ value, onCycle }: { value: number; onCycle: () => void }) {
  return (
    <Pressable onPress={onCycle} style={styles.extraBtn} testID="player-rate">
      <Text style={styles.extraTxt}>{value}×</Text>
    </Pressable>
  );
}

function SleepPicker({
  visible, onClose, current, onPick,
}: {
  visible: boolean;
  onClose: () => void;
  current: SleepTimerMode;
  onPick: (m: SleepTimerMode) => void;
}) {
  const opts: { label: string; mode: SleepTimerMode }[] = [
    { label: "Arrêter", mode: null },
    { label: "15 minutes", mode: 15 * 60 },
    { label: "30 minutes", mode: 30 * 60 },
    { label: "1 heure", mode: 60 * 60 },
    { label: "Fin du morceau", mode: "endOfTrack" },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sleepStyles.bg} onPress={onClose}>
        <Pressable style={sleepStyles.sheet} onPress={() => {}}>
          <Text style={sleepStyles.title}>Minuteur de sommeil</Text>
          {opts.map((o) => (
            <Pressable
              key={String(o.mode)}
              onPress={() => onPick(o.mode)}
              style={[sleepStyles.row, JSON.stringify(o.mode) === JSON.stringify(current) && sleepStyles.rowActive]}
            >
              <Text style={sleepStyles.rowTxt}>{o.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sleepStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: mediaTheme.bgTop, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 8,
  },
  title: { color: mediaTheme.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  row: { paddingVertical: 14, borderRadius: 12, paddingHorizontal: 16 },
  rowActive: { backgroundColor: mediaTheme.goldSoft },
  rowTxt: { color: mediaTheme.text, fontSize: 15, fontWeight: "600" },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 8 },
  chevron: { color: mediaTheme.text, fontSize: 32, marginTop: -8 },
  heart: { color: mediaTheme.textMuted, fontSize: 28 },
  eyebrow: { color: mediaTheme.gold, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textAlign: "center" },
  headerTitle: { color: mediaTheme.text, fontWeight: "800", fontSize: 15, textAlign: "center" },
  tabs: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 8, marginBottom: 16 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: mediaTheme.card },
  tabActive: { backgroundColor: mediaTheme.gold },
  tabTxt: { color: mediaTheme.textMuted, fontWeight: "700", fontSize: 12 },
  tabTxtActive: { color: "#000" },
  artWrap: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingHorizontal: 40 },
  art: {
    width: "100%", aspectRatio: 1, borderRadius: 16,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }, android: { elevation: 12 } }),
  },
  artImg: { width: "100%", height: "100%" },
  artInitials: { color: "#FFF", fontSize: 80, fontWeight: "900" },
  scriptWrap: { flex: 1, backgroundColor: mediaTheme.bgElevated, marginHorizontal: 20, borderRadius: 14 },
  scriptTitle: { color: mediaTheme.text, fontSize: 20, fontWeight: "800" },
  scriptAuthor: { color: mediaTheme.gold, fontSize: 13, marginTop: 4, marginBottom: 16 },
  scriptTxt: { color: mediaTheme.textMuted, fontSize: 14, lineHeight: 22 },
  bottom: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 16, gap: 4 },
  title: { color: mediaTheme.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  author: { color: mediaTheme.textMuted, fontSize: 13, textAlign: "center" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  time: { color: mediaTheme.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingHorizontal: 12 },
  ctrlIcon: { color: mediaTheme.text, fontSize: 30 },
  jumpBtn: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
    backgroundColor: mediaTheme.card, borderWidth: 1, borderColor: mediaTheme.border,
  },
  jumpTxt: { color: mediaTheme.text, fontWeight: "800", fontSize: 12 },
  playBtn: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: mediaTheme.gold,
    alignItems: "center", justifyContent: "center",
  },
  playIcon: { color: "#000", fontWeight: "900", fontSize: 22 },
  extraRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 16 },
  extraBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: mediaTheme.border, backgroundColor: mediaTheme.card,
  },
  extraTxt: { color: mediaTheme.text, fontWeight: "700", fontSize: 12 },
  noAudio: { marginTop: 12, padding: 10, backgroundColor: mediaTheme.rubySoft, borderRadius: 10 },
  noAudioTxt: { color: "#FFC5CE", fontSize: 12, textAlign: "center", lineHeight: 17 },
});
