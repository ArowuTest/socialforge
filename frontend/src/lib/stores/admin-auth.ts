"use client";

/**
 * Separate auth store for the admin portal.
 * Uses a different localStorage key ("sf-admin-auth") so admin sessions
 * are completely independent from regular user sessions — logging in as a
 * customer never clobbers the admin session and vice-versa.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User } from "@/types";
import type { AuthTokens } from "@/types";

const ADMIN_ACCESS_KEY = "sf_admin_access_token";
const ADMIN_REFRESH_KEY = "sf_admin_refresh_token";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function setAdminTokens(tokens: AuthTokens) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_ACCESS_KEY, tokens.accessToken);
  if (tokens.refreshToken) localStorage.setItem(ADMIN_REFRESH_KEY, tokens.refreshToken);
}

function clearAdminTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_ACCESS_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
}

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_ACCESS_KEY);
}

/** Raw fetch wrapper using the admin token (no Zustand dependency) */
export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface AdminAuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const res = await adminRequest<{
            data: {
              access_token: string;
              refresh_token: string;
              expires_at: string;
              user: User;
            };
          }>("/api/v1/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });

          const d = res.data;

          // Verify the account actually has superadmin privileges
          if (!d.user?.is_super_admin) {
            throw new Error("Access denied: this account does not have admin privileges.");
          }

          setAdminTokens({
            accessToken: d.access_token,
            refreshToken: d.refresh_token,
            expiresIn: new Date(d.expires_at).getTime() - Date.now(),
          });

          set({ user: d.user, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        clearAdminTokens();
        set({ user: null, isAuthenticated: false });
      },

      hydrate: async () => {
        const token = getAdminToken();
        if (!token) return;
        const { isAuthenticated } = get();
        if (!isAuthenticated) return;
        try {
          const res = await adminRequest<{ data: User }>("/api/v1/auth/me");
          if (!res.data?.is_super_admin) {
            // Token belongs to a non-admin; clear it
            clearAdminTokens();
            set({ user: null, isAuthenticated: false });
            return;
          }
          set({ user: res.data });
        } catch {
          clearAdminTokens();
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: "sf-admin-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : ({} as Storage)
      ),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
