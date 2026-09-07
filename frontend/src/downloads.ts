import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL!;

// Fetches a protected file from the API and either triggers a browser download
// (web) or downloads it via expo-file-system + opens the OS share sheet (native).
export async function downloadExport(path: string, filename: string, token: string | null) {
  const url = `${BASE}/api${path}`;

  if (Platform.OS === "web") {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    if (!res.ok) throw new Error(`Export échoué (${res.status})`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    return;
  }

  // Native: expo-file-system legacy API is simplest and stable in SDK 57.
  // @ts-ignore - support both new and legacy modules
  const legacy = (FileSystem as any).legacy || FileSystem;
  const target = `${legacy.cacheDirectory}${filename}`;
  const res = await legacy.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${token || ""}` },
  });
  if (res.status && res.status >= 400) {
    throw new Error(`Export échoué (${res.status})`);
  }
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(res.uri);
  }
}
