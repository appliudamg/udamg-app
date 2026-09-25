import { useState } from "react";
import { View, TextInput, Pressable, StyleSheet, TextInputProps, StyleProp, ViewStyle, TextStyle } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { colors } from "@/src/theme";

type Props = TextInputProps & { containerStyle?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle>; iconColor?: string };

/** Champ mot de passe avec bouton afficher / masquer. */
export function PasswordInput({ containerStyle, inputStyle, iconColor = colors.muted, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, inputStyle]}
      />
      <Pressable
        testID={`${props.testID || "password"}-toggle`}
        onPress={() => setVisible((v) => !v)}
        style={styles.toggle}
        hitSlop={8}
        accessibilityLabel={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <EyeOff size={20} color={iconColor} /> : <Eye size={20} color={iconColor} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "center" },
  input: { paddingRight: 48 },
  toggle: { position: "absolute", right: 4, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" },
});
