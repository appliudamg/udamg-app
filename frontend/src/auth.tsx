import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, AuthResponse, User } from "./api";

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

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nom: string, prenom: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const save = async (r: AuthResponse) => {
    await storage.set(r.access_token);
    setToken(r.access_token);
    setUser(r.user);
  };

  const login = async (email: string, password: string) => {
    const r = await api<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await save(r);
  };

  const register = async (email: string, password: string, nom: string, prenom: string) => {
    const r = await api<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, nom, prenom }),
    });
    await save(r);
  };

  const logout = async () => {
    await storage.remove();
    setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be within AuthProvider");
  return v;
}
