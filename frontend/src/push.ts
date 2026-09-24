import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { API_BASE } from "./api";

/**
 * Enregistre le téléphone pour les notifications push (natif uniquement).
 * Appelé à chaque ouverture de session : les jetons peuvent changer.
 * Ne bloque jamais le parcours utilisateur en cas de refus.
 */
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted" && current.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${API_BASE}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, platform: Platform.OS, device_token: String(tokenResp.data) }),
    });
  } catch (e) {
    console.warn("Push registration failed", e);
  }
}
