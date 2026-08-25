import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserRecord } from "@agenpic/types";
import { client, setRememberMe } from "../lib/pocketbase";

interface AuthContextValue {
  user: UserRecord | null;
  isLoading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  signup: (email: string, password: string, name: string, remember?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(client.currentUser);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return client.onAuthChange((u) => setUser(u));
  }, []);

  useEffect(() => {
    // A persisted token can be stale (expired/revoked) by the time the app
    // reopens. Refresh it to keep the session alive and pick up any
    // profile changes; if that fails the token is truly dead, so drop it
    // and let the user log in again rather than sitting on a broken session.
    if (!client.isAuthenticated) return;
    client.pb
      .collection("users")
      .authRefresh()
      .catch(() => client.logout());
  }, []);

  const login = async (email: string, password: string, remember = true) => {
    setIsLoading(true);
    setRememberMe(remember);
    try {
      await client.login(email, password);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email: string, password: string, name: string, remember = true) => {
    setIsLoading(true);
    setRememberMe(remember);
    try {
      await client.signup(email, password, name);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => client.logout();

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
