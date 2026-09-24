import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, AuthResponse, User } from "./api";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "udamg_auth_token";

const storage = {
  get: () =>
    Platform.OS === "web"
      ? Promise.resolve(typeof localStorage === "undefined" ? null : localStorage.getItem(TOKEN_KEY))
      : SecureStore.getItemAsync(TOKEN_KEY),
  set: (v: string) =>
    Platform.OS === "web"
      ? Promise.resolve(localStorage.setItem(TOKEN_KEY, v))
      : SecureStore.setItemAsync(TOKEN_KEY, v),
  remove: () =>
    Platform.OS === "web"
      ? Promise.resolve(localStorage.removeItem(TOKEN_KEY))
      : SecureStore.deleteItemAsync(TOKEN_KEY),
};

type AccessDenied = { code: string; email?: string; message: string };

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  denied: AccessDenied | null;
  clearDenied: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nom: string, prenom: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const extractSessionId = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<AccessDenied | null>(null);
  const usedIds = useRef<Set<string>>(new Set());

  const clearDenied = () => setDenied(null);

  const captureDenied = (e: unknown) => {
    if (e instanceof ApiError && e.status === 403 && typeof e.detail === "object" && e.detail?.code === "email_not_approved") {
      setDenied({
        code: e.detail.code,
        email: e.detail.email,
        message: e.detail.message || "Votre email n'a pas accès à l'application.",
      });
      return true;
    }
    return false;
  };

  const save = async (r: AuthResponse) => {
    await storage.set(r.access_token);
    setToken(r.access_token);
    setUser(r.user);
  };

  const exchangeSession = async (sid: string) => {
    if (usedIds.current.has(sid)) return;
    usedIds.current.add(sid);
    const r = await api<AuthResponse>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ session_id: sid }),
    });
    await save(r);
  };

  // Mobile: capture deep links
  const captured = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      captured.current = url;
      const sid = extractSessionId(url);
      if (sid) exchangeSession(sid).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // Initial mount: check web URL for session_id first, else stored token
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid = extractSessionId(window.location.hash) || extractSessionId(window.location.search);
          if (sid) {
            try {
              await exchangeSession(sid);
              // Clean URL
              try {
                const url = new URL(window.location.href);
                url.hash = "";
                url.searchParams.delete("session_id");
                window.history.replaceState(window.history.state, "", url.toString());
              } catch {}
              setLoading(false);
              return;
            } catch (e) {
              captureDenied(e);
              try {
                const url = new URL(window.location.href);
                url.hash = "";
                url.searchParams.delete("session_id");
                window.history.replaceState(window.history.state, "", url.toString());
              } catch {}
            }
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            try {
              await exchangeSession(sid);
              setLoading(false);
              return;
            } catch (e) {
              captureDenied(e);
            }
          }
        }
        const saved = await storage.get();
        if (saved) {
          try {
            const me = await api<User>("/auth/me", {}, saved);
            setToken(saved);
            setUser(me);
          } catch {
            await storage.remove();
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const r = await api<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await save(r);
    } catch (e) {
      if (captureDenied(e)) return;
      throw e;
    }
  };

  const register = async (email: string, password: string, nom: string, prenom: string) => {
    try {
      const r = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, nom, prenom }),
      });
      await save(r);
    } catch (e) {
      if (captureDenied(e)) return;
      throw e;
    }
  };

  const loginWithGoogle = async () => {
    const redirectUrl = Platform.OS === "web"
      ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
      : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    // @ts-ignore  - type differs by platform
    if (result?.type === "success" && result.url) url = result.url;
    if (!url) url = captured.current;
    if (!url) url = await Linking.getInitialURL();
    const sid = extractSessionId(url);
    if (!sid) throw new Error("Connexion Google annulée");
    try {
      await exchangeSession(sid);
    } catch (e) {
      if (captureDenied(e)) return;
      throw e;
    }
  };

  const logout = async () => {
    await storage.remove();
    setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, loading, denied, clearDenied, login, register, loginWithGoogle, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be within AuthProvider");
  return v;
}
