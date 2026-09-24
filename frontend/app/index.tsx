import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { IntroVideo } from "@/src/IntroVideo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius } from "@/src/theme";

const MAX_INTRO_MS = 12000;

export default function IntroSplash() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [videoDone, setVideoDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const navigated = useRef(false);

  const onVideoDone = useCallback(() => setVideoDone(true), []);
  const onPlaying = useCallback(() => setPlaying(true), []);

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
      <IntroVideo onEnd={onVideoDone} onError={onVideoDone} onPlaying={onPlaying} />
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]} pointerEvents="box-none">
        {playing && (
        <Pressable
          testID="splash-skip"
          onPress={() => setVideoDone(true)}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Text style={styles.skipTxt}>Passer</Text>
        </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  overlay: { flex: 1, justifyContent: "flex-start", alignItems: "flex-end", paddingHorizontal: spacing.xl },
  skip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.55)",
    minHeight: 44, justifyContent: "center",
  },
  skipTxt: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 14 },
});
