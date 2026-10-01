import { Linking } from "react-native";

/** Page de dons / offrandes (Linktree) — bloc « Je donne » du menu et bouton du lecteur. */
export const DON_URL = "https://linktr.ee/offrandesccmgi";

export const openDonation = () => Linking.openURL(DON_URL).catch(() => {});
