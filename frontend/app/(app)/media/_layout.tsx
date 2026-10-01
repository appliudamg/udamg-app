import React from "react";
import { Stack } from "expo-router";
import { mediaTheme } from "@/src/media_theme";

// Le lecteur (PlayerProvider, MiniPlayer, PlayerModal) vit dans app/(app)/_layout.tsx :
// la lecture continue quand on quitte le bloc Media.
export default function MediaLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: mediaTheme.bg },
        animation: "fade",
      }}
    />
  );
}
