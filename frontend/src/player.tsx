/**
 * Player Context — Pôle 3
 * Global audio player powered by expo-audio, with queue, mini-player state,
 * sleep timer, speed control, favorites toggle, and server-side progress sync.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import { MediaItem, api, mediaFileUrl } from "@/src/api";
import { useAuth } from "@/src/auth";

// Enable playback while the app is in the background / device is silenced.
// Full lock-screen controls require a native build (documented for the user).
setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: "duckOthers",
}).catch(() => {});

export type SleepTimerMode = null | "endOfTrack" | number; // number = seconds

type Ctx = {
  current: MediaItem | null;
  queue: MediaItem[];
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  playbackRate: number;
  favorites: Set<string>;
  playerVisible: boolean;
  sleepTimer: SleepTimerMode;
  sleepRemainingSec: number | null;

  play: (item: MediaItem, queue?: MediaItem[]) => Promise<void>;
  toggle: () => void;
  seek: (sec: number) => void;
  seekBy: (deltaSec: number) => void;
  next: () => void;
  prev: () => void;
  setRate: (r: number) => void;
  setSleepTimer: (m: SleepTimerMode) => void;
  openPlayer: () => void;
  closePlayer: () => void;
  toggleFavorite: (mediaId: string) => Promise<void>;
  isFavorite: (mediaId: string) => boolean;
  refreshFavorites: () => Promise<void>;
};

const PlayerCtx = createContext<Ctx | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const playerRef = useRef<AudioPlayer | null>(null);
  const savedAtRef = useRef<number>(0);
  const nextRef = useRef<() => void>(() => {});

  const [current, setCurrent] = useState<MediaItem | null>(null);
  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [playerVisible, setPlayerVisible] = useState(false);
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerMode>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  // ---- Favorites bootstrap ----
  const refreshFavorites = useCallback(async () => {
    if (!token) return;
    try {
      const favs = await api<MediaItem[]>("/media/favorites/list", {}, token);
      setFavorites(new Set(favs.map((f) => f.id)));
    } catch {}
  }, [token]);

  useEffect(() => { refreshFavorites(); }, [refreshFavorites]);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const toggleFavorite = useCallback(async (id: string) => {
    if (!token) return;
    const was = favorites.has(id);
    // optimistic
    setFavorites((prev) => {
      const next = new Set(prev);
      if (was) next.delete(id); else next.add(id);
      return next;
    });
    try {
      if (was) {
        await api(`/media/${id}/favorite`, { method: "DELETE" }, token);
      } else {
        await api(`/media/${id}/favorite`, { method: "POST" }, token);
      }
    } catch (e) {
      // revert on error
      setFavorites((prev) => {
        const next = new Set(prev);
        if (was) next.add(id); else next.delete(id);
        return next;
      });
      throw e;
    }
  }, [favorites, token]);

  // ---- Save progress helper (throttled to every 5 s) ----
  const saveProgress = useCallback(async (position: number, completed = false) => {
    if (!token || !current) return;
    const now = Date.now();
    if (!completed && now - savedAtRef.current < 5000) return;
    savedAtRef.current = now;
    try {
      await api("/media/progress", {
        method: "POST",
        body: JSON.stringify({
          media_id: current.id,
          last_position_seconds: Math.max(0, position),
          completed,
        }),
      }, token);
    } catch {}
  }, [current, token]);

  // ---- Play a media item ----
  const play = useCallback(async (item: MediaItem, newQueue?: MediaItem[]) => {
    if (!token) return;
    // dispose previous
    if (playerRef.current) {
      try { playerRef.current.pause(); } catch {}
      try { playerRef.current.removeAllListeners?.("playbackStatusUpdate"); } catch {}
      try { playerRef.current.remove(); } catch {}
      playerRef.current = null;
    }

    setCurrent(item);
    setQueue(newQueue && newQueue.length > 0 ? newQueue : [item]);
    setPositionSec(0);
    setDurationSec(item.duration || 0);

    if (!item.audio_path) {
      // no audio: show metadata / script only
      setIsPlaying(false);
      return;
    }

    if (item.kind === "video") {
      // Video playback is delegated to <VideoView> inside PlayerModal.
      // We only track "current" here so mini-player and modal see the item.
      setIsPlaying(false);
      return;
    }

    const url = mediaFileUrl(item.id, token);
    try {
      const p = createAudioPlayer({ uri: url }, { updateInterval: 500 });
      playerRef.current = p;
      p.playbackRate = playbackRate;
      // Reliable end-of-track detection via the SDK's own event
      p.addListener?.("playbackStatusUpdate", (status: any) => {
        // Ignore events from a disposed player (user switched track).
        if (!playerRef.current) return;
        if (typeof status?.currentTime === "number") setPositionSec(status.currentTime);
        if (typeof status?.duration === "number" && status.duration > 0) {
          setDurationSec((prev) => (Math.abs(prev - status.duration) > 0.1 ? status.duration : prev));
        }
        if (typeof status?.playing === "boolean") {
          setIsPlaying(status.playing);
          if (status.playing) {
            saveProgress(status.currentTime || 0);
          }
        }
        if (status?.didJustFinish) {
          saveProgress(status.duration || 0, true);
          if (sleepTimer === "endOfTrack") {
            setSleepTimerState(null);
            setSleepRemainingSec(null);
          } else {
            nextRef.current();
          }
        }
      });
      p.play();
      setIsPlaying(true);
    } catch (e) {
      console.warn("audio player init failed", e);
      setIsPlaying(false);
    }
  }, [playbackRate, token, saveProgress, sleepTimer]);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.playing) { p.pause(); setIsPlaying(false); saveProgress(positionSec); }
    else { p.play(); setIsPlaying(true); }
  }, [positionSec, saveProgress]);

  const seek = useCallback((sec: number) => {
    const p = playerRef.current;
    if (!p) return;
    try { p.seekTo(Math.max(0, sec)); setPositionSec(sec); } catch {}
  }, []);

  const seekBy = useCallback((delta: number) => {
    seek(Math.max(0, positionSec + delta));
  }, [positionSec, seek]);

  const setRate = useCallback((r: number) => {
    setPlaybackRate(r);
    const p = playerRef.current;
    if (p) { try { p.playbackRate = r; } catch {} }
  }, []);

  const currentIndex = useMemo(
    () => (current ? queue.findIndex((q) => q.id === current.id) : -1),
    [current, queue],
  );

  const next = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= queue.length - 1) return;
    const n = queue[currentIndex + 1];
    if (n) play(n, queue).catch(() => {});
  }, [currentIndex, play, queue]);

  // Keep a ref to `next` so the audio player listener can call it
  // without creating a circular useCallback dependency (TDZ error).
  useEffect(() => { nextRef.current = next; }, [next]);

  const prev = useCallback(() => {
    if (positionSec > 3) { seek(0); return; }
    if (currentIndex > 0) {
      const p = queue[currentIndex - 1];
      if (p) play(p, queue).catch(() => {});
    } else {
      seek(0);
    }
  }, [currentIndex, play, positionSec, queue, seek]);

  // ---- Fallback poller: keep position in sync if the SDK event fires late. ----
  // End-of-track detection is now driven by the `didJustFinish` event on the
  // player (see play() above). The old auto-advance logic here was firing
  // spuriously when the audio failed to actually start on iOS, cutting off
  // playback immediately.
  useEffect(() => {
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const pos = p.currentTime ?? 0;
        const dur = p.duration ?? 0;
        setPositionSec(pos);
        if (dur > 0 && dur !== durationSec) setDurationSec(dur);
        const playing = !!p.playing;
        if (playing !== isPlaying) setIsPlaying(playing);
      } catch {}
    }, 1000);
    return () => clearInterval(t);
  }, [durationSec, isPlaying]);

  // ---- Sleep timer countdown ----
  useEffect(() => {
    if (typeof sleepTimer !== "number") { setSleepRemainingSec(null); return; }
    setSleepRemainingSec(sleepTimer);
    const started = Date.now();
    const t = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = sleepTimer - elapsed;
      if (remaining <= 0) {
        clearInterval(t);
        setSleepRemainingSec(0);
        setSleepTimerState(null);
        const p = playerRef.current;
        if (p) { try { p.pause(); } catch {} }
        setIsPlaying(false);
      } else {
        setSleepRemainingSec(remaining);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [sleepTimer]);

  const setSleepTimer = useCallback((m: SleepTimerMode) => {
    setSleepTimerState(m);
  }, []);

  const openPlayer = useCallback(() => setPlayerVisible(true), []);
  const closePlayer = useCallback(() => setPlayerVisible(false), []);

  // ---- Save progress when app backgrounds ----
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && current) {
        saveProgress(positionSec);
      }
    });
    return () => sub.remove();
  }, [current, positionSec, saveProgress]);

  const value: Ctx = useMemo(() => ({
    current, queue, isPlaying, positionSec, durationSec, playbackRate, favorites,
    playerVisible, sleepTimer, sleepRemainingSec,
    play, toggle, seek, seekBy, next, prev, setRate, setSleepTimer,
    openPlayer, closePlayer, toggleFavorite, isFavorite, refreshFavorites,
  }), [
    current, queue, isPlaying, positionSec, durationSec, playbackRate, favorites,
    playerVisible, sleepTimer, sleepRemainingSec,
    play, toggle, seek, seekBy, next, prev, setRate, setSleepTimer,
    openPlayer, closePlayer, toggleFavorite, isFavorite, refreshFavorites,
  ]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer(): Ctx {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return c;
}
