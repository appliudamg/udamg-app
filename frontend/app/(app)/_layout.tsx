import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { registerForPush } from "@/src/push";
import { PlayerProvider } from "@/src/player";
import { MiniPlayer } from "@/src/media/MiniPlayer";
import { PlayerModal } from "@/src/media/PlayerModal";
import { colors } from "@/src/theme";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Enregistre le téléphone pour les notifications push à chaque session
  useEffect(() => {
    if (user) registerForPush(user.id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <PlayerProvider>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        {/* Lecteur global : la lecture continue sur tous les écrans de l'application */}
        <MiniPlayer />
        <PlayerModal />
      </View>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
});
