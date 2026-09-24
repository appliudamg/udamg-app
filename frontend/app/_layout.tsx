import "react-native-gesture-handler";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { Alert, LogBox, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/auth";
import { ToastProvider } from "@/src/toast";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);

// Notifications push — comportement au premier plan (natif uniquement)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Canal Android — doit exister avant l'arrivée de la première notification
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Messages UDAMG",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function openFromNotification(router: ReturnType<typeof useRouter>, data: Record<string, any>) {
  const url = data?.deeplink || data?.action_url;
  if (!url) return;
  if (String(url).startsWith("http")) Linking.openURL(String(url));
  else router.push(String(url) as any);
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Tap sur une notification pendant que l'app est ouverte
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(router, response.notification.request.content.data || {});
    });

    // Tap sur une notification alors que l'app était fermée
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromNotification(router, response.notification.request.content.data || {});
    });

    // Rappel hebdomadaire si les notifications ont été refusées définitivement
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      const stamp = () => AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
      Alert.alert(
        "Activer les notifications",
        "Recevez les messages de l'UDAMG directement sur votre téléphone, même quand l'application est fermée.",
        [
          { text: "Plus tard", style: "cancel", onPress: () => { stamp(); } },
          { text: "Ouvrir les réglages", onPress: () => { stamp(); Linking.openSettings(); } },
        ],
      );
    })();

    return () => { tapSub.remove(); };
  }, [router]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.surface },
                  }}
                />
              </ToastProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
