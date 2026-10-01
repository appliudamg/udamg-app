import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock, ChevronLeft } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/theme";

export const PASTEUR_PIN = "0123";

/** Écran de verrouillage par code à 4 chiffres (Espace Pasteur). Demandé à chaque ouverture. */
export function PinLock({ title, onUnlock, onCancel }: { title?: string; onUnlock: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const onChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setError(false);
    if (digits.length === 4) {
      if (digits === PASTEUR_PIN) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setPin(""), 350);
      }
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]} testID="pin-lock">
      <View style={styles.header}>
        <Pressable testID="pin-cancel" onPress={onCancel} style={styles.back} hitSlop={8}>
          <ChevronLeft size={26} color={colors.onSurface} />
        </Pressable>
      </View>
      <Pressable style={styles.center} onPress={() => inputRef.current?.focus()}>
        <View style={styles.lockWrap}><Lock size={30} color={colors.brandPrimary} /></View>
        <Text style={styles.title}>Espace Pasteur</Text>
        {!!title && <Text style={styles.sub}>{title}</Text>}
        <Text style={styles.hint}>Saisissez le code à 4 chiffres pour déverrouiller</Text>

        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, pin.length > i && styles.dotOn, error && styles.dotErr]} testID={`pin-dot-${i}`} />
          ))}
        </View>
        <TextInput
          ref={inputRef}
          testID="pin-input"
          value={pin}
          onChangeText={onChange}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          autoFocus
          style={styles.hidden}
          caretHidden
          {...(Platform.OS === "web" ? { inputMode: "numeric" as const } : {})}
        />
        <Text style={[styles.err, !error && { opacity: 0 }]} testID="pin-error">Code incorrect</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  lockWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13, letterSpacing: 1 },
  hint: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: spacing.sm },
  dots: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.brandPrimary, backgroundColor: "transparent" },
  dotOn: { backgroundColor: colors.brandPrimary },
  dotErr: { borderColor: colors.error, backgroundColor: colors.error },
  hidden: { position: "absolute", opacity: 0.01, width: 1, height: 1 },
  err: { color: colors.error, fontWeight: "700", marginTop: spacing.sm },
});
