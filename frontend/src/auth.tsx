import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, ApiError, AuthResponse, User } from "./api";

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
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<AccessDenied | null>(null);

  const clearDenied = () => setDenied(null);

  useEffect(() => {
    (async () => {
      try {
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
      await storage.set(r.access_token);
      setToken(r.access_token);
      setUser(r.user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && typeof e.detail === "object" && e.detail?.code === "email_not_approved") {
        setDenied({ code: e.detail.code, email: e.detail.email, message: e.detail.message });
        return;
      }
      throw e;
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    const me = await api<User>("/auth/me", {}, token);
    setUser(me);
  };

  const logout = async () => {
    await storage.remove();
    setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, loading, denied, clearDenied, login, refreshUser, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be within AuthProvider");
  return v;
}
