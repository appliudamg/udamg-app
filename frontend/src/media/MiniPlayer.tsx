import React from "react";
import { View, Text, StyleSheet, Pressable, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayer } from "@/src/player";
import { mediaTheme, initialsOf, categoryHue } from "@/src/media_theme";
import { mediaCoverUrl } from "@/src/api";

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const { current, isPlaying, positionSec, durationSec, toggle, openPlayer } = usePlayer();

  if (!current) return null;

  const pct = durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;
  const coverUri = mediaCoverUrl(current);
  const hue = categoryHue[current.category] || mediaTheme.violetDeep;

  return (
    <Pressable
      testID="mini-player"
      onPress={openPlayer}
      style={[styles.wrap, { bottom: insets.bottom + 8 }]}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.body}>
        <View style={[styles.cover, { backgroundColor: hue }]}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <Text style={styles.coverTxt}>{initialsOf(current.title)}</Text>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.author} numberOfLines={1}>{current.author}</Text>
        </View>
        <Pressable
          testID="mini-player-toggle"
          onPress={(e) => { e.stopPropagation?.(); toggle(); }}
          hitSlop={12}
          style={styles.playBtn}
        >
          <Text style={styles.playIcon}>{isPlaying ? "❚❚" : "▶"}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12, right: 12,
    backgroundColor: mediaTheme.cardHi,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mediaTheme.border,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  progressTrack: { height: 2, backgroundColor: mediaTheme.divider },
  progressFill: { height: 2, backgroundColor: mediaTheme.gold },
  body: { flexDirection: "row", alignItems: "center", padding: 8, gap: 10 },
  cover: {
    width: 44, height: 44, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  coverImg: { width: "100%", height: "100%" },
  coverTxt: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: mediaTheme.text, fontWeight: "700", fontSize: 14 },
  author: { color: mediaTheme.textMuted, fontSize: 12, marginTop: 1 },
  playBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: mediaTheme.gold,
    alignItems: "center", justifyContent: "center",
  },
  playIcon: { color: "#000", fontWeight: "900", fontSize: 14 },
});
