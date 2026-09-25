import React, { useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";
import { api, MediaItem } from "@/src/api";
import { mediaTheme, categoryHue } from "@/src/media_theme";
import { MediaCard } from "@/src/media/MediaCard";
import { usePlayer } from "@/src/player";
import { BottomNav } from "@/src/media/BottomNav";
import { canWriteMedia } from "@/src/roles";
import { Settings } from "lucide-react-native";
import { StoriesStrip } from "@/src/media/StoriesStrip";

export default function MediaHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const player = usePlayer();
  const canAdmin = canWriteMedia(user?.role);

  const media = useQuery({
    queryKey: ["media", "all"],
    queryFn: () => api<MediaItem[]>("/media", {}, token),
    enabled: !!token,
  });

  const cont = useQuery({
    queryKey: ["media", "continue"],
    queryFn: () => api<MediaItem[]>("/media/progress/continue", {}, token),
    enabled: !!token,
  });

  const byCategory = useMemo(() => {
    const m = new Map<string, MediaItem[]>();
    (media.data ?? []).forEach((it) => {
      if (!m.has(it.category)) m.set(it.category, []);
      m.get(it.category)!.push(it);
    });
    return Array.from(m.entries());
  }, [media.data]);

  const featured = (media.data ?? []).slice(0, 5);
  const isLoading = media.isLoading;

  const onPlay = (item: MediaItem, queue?: MediaItem[]) => {
    player.play(item, queue).catch(() => {});
    player.openPlayer();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="media-back" onPress={() => router.push("/(app)/menu")} style={styles.back}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>UDAMG · MEDIA</Text>
          <Text style={styles.title}>Bonsoir {user?.prenom}</Text>
        </View>
        {canAdmin && (
          <Pressable
            testID="media-admin"
            onPress={() => router.push("/(app)/media/admin")}
            style={styles.adminBtn}
          >
            <Settings size={20} color="#000" />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={mediaTheme.gold} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 220 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={media.isRefetching} onRefresh={() => media.refetch()} tintColor={mediaTheme.gold} />
          }
        >
          <StoriesStrip />

          {/* Featured banners */}
          {featured.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
            >
              {featured.map((f) => (
                <MediaCard key={f.id} item={f} layout="hero" onPress={() => onPlay(f, media.data)} />
              ))}
            </ScrollView>
          )}

          {/* Ajouté récemment : fil mixant audios et vidéos */}
          {(media.data?.length ?? 0) > 0 && (
            <Section title="Ajouté récemment">
              {[...(media.data ?? [])]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 10)
                .map((it) => (
                  <MediaCard key={it.id} item={it} onPress={() => onPlay(it, media.data)} />
                ))}
            </Section>
          )}

          {/* Continue listening */}
          {(cont.data?.length ?? 0) > 0 && (
            <Section title="Continuer l'écoute">
              {cont.data!.map((it) => (
                <MediaCard key={it.id} item={it} onPress={() => onPlay(it, cont.data)} />
              ))}
            </Section>
          )}

          {/* Quick shortcuts */}
          <View style={styles.shortcuts}>
            <ShortcutBtn label="Bibliothèque" hue={mediaTheme.violet} testID="shortcut-library-btn" onPress={() => router.push("/(app)/media/library")} />
            <ShortcutBtn label="Découvrir" hue={mediaTheme.ruby} testID="shortcut-discover-btn" onPress={() => router.push("/(app)/media/discover")} />
          </View>

          {/* Categories */}
          {byCategory.map(([cat, items]) => (
            <View key={cat} style={styles.catBlock}>
              <View style={styles.catHeader}>
                <View style={[styles.catDot, { backgroundColor: categoryHue[cat] || mediaTheme.violet }]} />
                <Text style={styles.catTitle}>{items[0]?.category_label ?? cat}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              >
                {items.map((it) => (
                  <MediaCard key={it.id} item={it} layout="tile" onPress={() => onPlay(it, items)} />
                ))}
              </ScrollView>
            </View>
          ))}

          {(media.data?.length ?? 0) === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Bibliothèque vide</Text>
              <Text style={styles.emptyTxt}>Aucun média disponible pour le moment.{canAdmin ? " Ajoutez vos premiers contenus via la console admin." : ""}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <BottomNav active="home" />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sec}>
      <Text style={styles.secTitle}>{title}</Text>
      <View style={{ gap: 4, paddingHorizontal: 20 }}>{children}</View>
    </View>
  );
}

function ShortcutBtn({ label, hue, onPress, testID }: { label: string; hue: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.shortBtn, { backgroundColor: hue + "22", borderColor: hue }]}>
      <Text style={[styles.shortTxt, { color: hue }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.card },
  backTxt: { color: mediaTheme.text, fontSize: 28, marginTop: -4 },
  adminBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: mediaTheme.gold },
  adminTxt: { color: "#000", fontSize: 18, fontWeight: "800" },
  eyebrow: { color: mediaTheme.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: mediaTheme.text, fontSize: 22, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  shortcuts: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 8 },
  shortBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  shortTxt: { fontWeight: "800", fontSize: 13 },

  sec: { marginTop: 16, gap: 8 },
  secTitle: { color: mediaTheme.text, fontSize: 16, fontWeight: "800", paddingHorizontal: 20 },

  catBlock: { marginTop: 20 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catTitle: { color: mediaTheme.text, fontSize: 16, fontWeight: "800" },

  emptyBox: { padding: 32, alignItems: "center" },
  emptyTitle: { color: mediaTheme.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  emptyTxt: { color: mediaTheme.textMuted, textAlign: "center", lineHeight: 20 },
});
