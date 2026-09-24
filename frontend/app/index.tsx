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
  const navigated = useRef(false);

  const onVideoDone = useCallback(() => setVideoDone(true), []);

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
      <IntroVideo onEnd={onVideoDone} onError={onVideoDone} />
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]} pointerEvents="box-none">
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceInverse },
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
