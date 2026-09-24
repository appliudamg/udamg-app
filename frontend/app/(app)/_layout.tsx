import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { registerForPush } from "@/src/push";
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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
});
