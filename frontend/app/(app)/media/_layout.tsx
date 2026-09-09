import React from "react";
import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { PlayerProvider } from "@/src/player";
import { MiniPlayer } from "@/src/media/MiniPlayer";
import { PlayerModal } from "@/src/media/PlayerModal";
import { mediaTheme } from "@/src/media_theme";

export default function MediaLayout() {
  return (
    <PlayerProvider>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: mediaTheme.bg },
            animation: "fade",
          }}
        />
        <MiniPlayer />
        <PlayerModal />
      </View>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mediaTheme.bg },
});
