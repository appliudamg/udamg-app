import React, { createContext, useCallback, useContext, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { colors, radius, spacing } from "./theme";

type ToastKind = "success" | "error" | "info";
type Toast = { id: string; kind: ToastKind; message: string };

type ToastCtx = { show: (message: string, kind?: ToastKind) => void };
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <View pointerEvents="box-none" style={styles.container} testID="toast-container">
        {items.map((t) => (
          <View
            key={t.id}
            style={[
              styles.toast,
              t.kind === "success" && styles.success,
              t.kind === "error" && styles.error,
              t.kind === "info" && styles.info,
            ]}
            testID={`toast-${t.kind}`}
          >
            <Text style={styles.icon}>
              {t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ"}
            </Text>
            <Text style={styles.text} numberOfLines={3}>{t.message}</Text>
          </View>
        ))}
      </View>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be inside ToastProvider");
  return v;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute", right: spacing.lg, bottom: spacing.xl,
    gap: spacing.sm, maxWidth: 340, zIndex: 9999,
  },
  toast: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md, minHeight: 48,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.error },
  info: { backgroundColor: colors.surfaceInverse },
  icon: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
  text: { color: "#FFFFFF", fontWeight: "700", flex: 1, fontSize: 13 },
});
