import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { MediaItem, mediaCoverUrl, fmtDuration } from "@/src/api";
import { mediaTheme, categoryHue, initialsOf, kindLabel } from "@/src/media_theme";

export function MediaCard({
  item,
  onPress,
  layout = "row",
  right,
}: {
  item: MediaItem;
  onPress?: () => void;
  layout?: "row" | "tile" | "hero";
  right?: React.ReactNode;
}) {
  const cover = mediaCoverUrl(item);
  const hue = categoryHue[item.category] || mediaTheme.violetDeep;

  if (layout === "tile") {
    return (
      <Pressable
        testID={`media-tile-${item.id}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.tileCover, { backgroundColor: hue }]}>
          {cover ? <Image source={{ uri: cover }} style={styles.img} /> : <Text style={styles.initials}>{initialsOf(item.title)}</Text>}
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.tileAuthor} numberOfLines={1}>{item.author}</Text>
      </Pressable>
    );
  }

  if (layout === "hero") {
    return (
      <Pressable
        testID={`media-hero-${item.id}`}
        onPress={onPress}
        style={({ pressed }) => [styles.hero, { backgroundColor: hue }, pressed && { opacity: 0.9 }]}
      >
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : null}
        <View style={styles.heroOverlay}>
          <Text style={styles.heroEyebrow}>{item.category_label.toUpperCase()}{item.subcategory ? ` · ${item.subcategory.toUpperCase()}` : ""}</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.heroAuthor}>{item.author}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={`media-row-${item.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.rowCover, { backgroundColor: hue }]}>
        {cover ? <Image source={{ uri: cover }} style={styles.img} /> : <Text style={styles.initialsRow}>{initialsOf(item.title)}</Text>}
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowAuthor} numberOfLines={1}>
          {item.author} · {kindLabel[item.kind] || "Audio"}
          {item.duration ? ` · ${fmtDuration(item.duration)}` : ""}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: 148, gap: 6 },
  tileCover: { width: 148, height: 148, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  initials: { color: "#FFF", fontSize: 30, fontWeight: "900" },
  tileTitle: { color: mediaTheme.text, fontWeight: "700", fontSize: 13, marginTop: 4 },
  tileAuthor: { color: mediaTheme.textMuted, fontSize: 11 },

  hero: {
    height: 200, borderRadius: 16, overflow: "hidden", marginRight: 12,
    width: 300, justifyContent: "flex-end",
  },
  heroOverlay: {
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  heroEyebrow: { color: mediaTheme.gold, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  heroTitle: { color: "#FFF", fontSize: 18, fontWeight: "800", marginTop: 4 },
  heroAuthor: { color: "#E5E7EB", fontSize: 12, marginTop: 2 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowCover: { width: 52, height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initialsRow: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  rowMeta: { flex: 1, minWidth: 0 },
  rowTitle: { color: mediaTheme.text, fontSize: 14, fontWeight: "700" },
  rowAuthor: { color: mediaTheme.textMuted, fontSize: 12, marginTop: 2 },
});
