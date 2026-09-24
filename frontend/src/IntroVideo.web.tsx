import { useEffect, useRef } from "react";
import { Asset } from "expo-asset";

const INTRO = require("../assets/video/intro.mp4");

type Props = { onEnd: () => void; onError: () => void };

/** Version web — balise <video> native : autoplay muet + playsInline (obligatoire sur iPhone/Safari). */
export function IntroVideo({ onEnd, onError }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const uri = Asset.fromModule(INTRO).uri;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    const t = setTimeout(tryPlay, 400);
    return () => clearTimeout(t);
  }, [uri]);

  return (
    <video
      ref={ref}
      src={uri}
      autoPlay
      muted
      playsInline
      preload="auto"
      onEnded={onEnd}
      onError={onError}
      style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
        objectFit: "cover", backgroundColor: "#0F172A",
      }}
    />
  );
}
