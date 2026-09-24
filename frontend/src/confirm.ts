import { Alert, Platform } from "react-native";

/** Confirmation destructive cross-platform (Alert natif / window.confirm sur le web). */
export function confirmAction(title: string, message: string, onConfirm: () => void, confirmLabel = "Supprimer") {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Annuler", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
