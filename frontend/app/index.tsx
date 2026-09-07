import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors, spacing } from "@/src/theme";

const BG_IMG = "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwY2h1cmNoJTIwY3Jvc3MlMjBsaWdodHxlbnwwfHx8fDE3ODg2NTEwMTh8MA&ixlib=rb-4.1.0&q=85";

export default function Splash() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (user) router.replace("/(app)/menu");
      else router.replace("/login");
    }, 900);
    return () => clearTimeout(t);
  }, [loading, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <ImageBackground source={{ uri: BG_IMG }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={["rgba(15,23,42,0.15)", "rgba(15,23,42,0.85)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.content}>
          <Text style={styles.brand} testID="splash-app-name">UDAMG</Text>
          <Text style={styles.slogan} testID="splash-slogan">Sauvé par Grâce pour Sauver</Text>
          <ActivityIndicator color={colors.onSurfaceInverse} style={{ marginTop: spacing.xl }} />
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceInverse },
  bg: { flex: 1, justifyContent: "flex-end" },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.sm },
  brand: {
    fontSize: 44, fontWeight: "800", color: colors.onSurfaceInverse, letterSpacing: 2,
  },
  slogan: {
    fontSize: 16, color: colors.onSurfaceInverse, fontStyle: "italic", opacity: 0.95,
  },
});
