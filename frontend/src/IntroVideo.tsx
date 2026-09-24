import { useEffect } from "react";
import { Platform, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";

const INTRO = require("../assets/video/intro.mp4");

type Props = { onEnd: () => void; onError: () => void };

/** Version native (iOS / Android) — expo-video avec son. */
export function IntroVideo({ onEnd, onError }: Props) {
  const player = useVideoPlayer(INTRO, (p) => {
    p.loop = false;
    p.muted = Platform.OS === "web";
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  useEffect(() => {
    if (status === "readyToPlay" && !isPlaying) {
      try { player.play(); } catch {}
    }
    if (status === "error") onError();
  }, [status, isPlaying, player, onError]);

  useEffect(() => {
    const sub = player.addListener("playToEnd", onEnd);
    return () => sub.remove();
  }, [player, onEnd]);

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="cover"
      nativeControls={false}
      playsInline
      allowsPictureInPicture={false}
    />
  );
}

const styles = StyleSheet.create({
  video: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" },
});
