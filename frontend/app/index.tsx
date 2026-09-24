import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

const INTRO = require("../assets/video/intro.mp4");
const MAX_INTRO_MS = 12000;

export default function IntroSplash() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [videoDone, setVideoDone] = useState(false);
  const navigated = useRef(false);

  const player = useVideoPlayer(INTRO, (p) => {
    p.loop = false;
    // Autoplay is only allowed muted on the web.
    p.muted = Platform.OS === "web";
  });

  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  // Lance la lecture dès que le lecteur est prêt (et réessaie après montage).
  useEffect(() => {
    if (status === "readyToPlay" && !isPlaying) {
      try { player.play(); } catch {}
    }
  }, [status, isPlaying, player]);

  useEffect(() => {
    const t = setTimeout(() => { try { player.play(); } catch {} }, 300);
    return () => clearTimeout(t);
  }, [player]);

  useEffect(() => {
    const sub = player.addListener("playToEnd", () => setVideoDone(true));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (status === "error") setVideoDone(true);
  }, [status]);

  // Sécurité : ne jamais bloquer l'utilisateur sur l'intro.
  useEffect(() => {
    const t = setTimeout(() => setVideoDone(true), MAX_INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!videoDone || loading || navigated.current) return;
    navigated.current = true;
    router.replace(user ? "/(app)/menu" : "/login");
  }, [videoDone, loading, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <Pressable
        style={[styles.overlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
        onPress={() => { try { player.play(); } catch {} }}
      >
        <Pressable
          testID="splash-skip"
          onPress={() => setVideoDone(true)}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Text style={styles.skipTxt}>Passer</Text>
        </Pressable>
        <View style={styles.footer}>
          <Text style={styles.brand} testID="splash-app-name">UDAMG</Text>
          <Text style={styles.slogan} testID="splash-slogan">Sauvé par Grâce pour Sauver</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceInverse },
  video: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" },
  overlay: { flex: 1, justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: spacing.xl },
  skip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
    minHeight: 44, justifyContent: "center",
  },
  skipTxt: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 14 },
  footer: { alignSelf: "stretch", gap: spacing.xs },
  brand: { fontSize: 32, fontWeight: "800", color: colors.onSurfaceInverse, letterSpacing: 2 },
  slogan: { fontSize: 14, color: colors.onSurfaceInverse, fontStyle: "italic", opacity: 0.9 },
});
