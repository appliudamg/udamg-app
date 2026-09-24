import { ScrollView, View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Play } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api, Story } from "@/src/api";
import { useAuth } from "@/src/auth";
import { canWriteMedia } from "@/src/roles";
import { mediaTheme } from "@/src/media_theme";

/** Bandeau Stories (contenus éphémères 24 h) affiché en tête de l'accueil Media. */
export function StoriesStrip() {
  const router = useRouter();
  const { user, token } = useAuth();
  const canPublish = canWriteMedia(user?.role);

  const stories = useQuery({
    queryKey: ["stories"],
    queryFn: () => api<Story[]>("/stories", {}, token),
    enabled: !!token,
    refetchInterval: 60000,
  });
  const list = stories.data ?? [];
  if (!canPublish && list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Stories</Text>
        {list.length > 0 && <Text style={styles.count}>{list.length} · disparaissent après 24 h</Text>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {canPublish && (
          <Pressable testID="story-add" onPress={() => router.push("/(app)/media/story-new" as any)} style={styles.item}>
            <View style={[styles.ring, styles.addRing]}>
              <View style={styles.addInner}><Plus size={26} color={mediaTheme.gold} /></View>
            </View>
            <Text style={styles.label} numberOfLines={1}>Publier</Text>
          </Pressable>
        )}
        {list.map((s) => (
          <Pressable
            key={s.id}
            testID={`story-${s.id}`}
            onPress={() => router.push({ pathname: "/(app)/media/stories", params: { start: s.id } } as any)}
            style={styles.item}
          >
            <LinearGradient
              colors={s.viewed ? [mediaTheme.border, mediaTheme.border] : [mediaTheme.gold, mediaTheme.ruby]}
              style={styles.ring}
            >
              <View style={styles.inner}>
                {s.kind === "image" && s.url ? (
                  <Image source={{ uri: s.url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.videoThumb]}><Play size={22} color={mediaTheme.gold} fill={mediaTheme.gold} /></View>
                )}
              </View>
            </LinearGradient>
            <Text style={styles.label} numberOfLines={1}>{s.caption || s.author_name || "Story"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const SIZE = 72;
const styles = StyleSheet.create({
  wrap: { paddingTop: 8 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 },
  title: { color: mediaTheme.text, fontSize: 18, fontWeight: "800" },
  count: { color: mediaTheme.textMuted, fontSize: 11 },
  row: { paddingHorizontal: 16, gap: 14 },
  item: { width: SIZE + 8, alignItems: "center", gap: 6 },
  ring: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, padding: 3, alignItems: "center", justifyContent: "center" },
  addRing: { borderWidth: 2, borderColor: mediaTheme.gold, borderStyle: "dashed", backgroundColor: "transparent" },
  addInner: { flex: 1, alignSelf: "stretch", borderRadius: SIZE / 2, alignItems: "center", justifyContent: "center" },
  inner: { flex: 1, alignSelf: "stretch", borderRadius: SIZE / 2, backgroundColor: mediaTheme.bg, padding: 2 },
  thumb: { flex: 1, borderRadius: SIZE / 2, backgroundColor: mediaTheme.card },
  videoThumb: { alignItems: "center", justifyContent: "center" },
  label: { color: mediaTheme.textMuted, fontSize: 11, maxWidth: SIZE + 8 },
});
