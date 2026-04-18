import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User, Workspace } from "@/types";
import { authApi, setTokens, clearTokens, loadTokensFromStorage } from "@/lib/api";
import type { AuthTokens, LoginRequest } from "@/types";

interface AuthState {
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  setWorkspace: (workspace: Workspace) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  hydrate: () => Promise<void>;
  setTokensAndUser: (tokens: AuthTokens, user: User, workspace: Workspace) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      workspace: null,
      workspaces: [],
      isAuthenticated: false,
      isLoading: false,

      login: async (data: LoginRequest) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login(data);
          // Backend returns: { data: { access_token, refresh_token, expires_at, user, workspace } }
          const d = res.data as unknown as {
            access_token: string;
            refresh_token: string;
            expires_at: string;
            user: User;
            workspace: Workspace;
          };
          setTokens({
            accessToken: d.access_token,
            refreshToken: d.refresh_token,
            expiresIn: new Date(d.expires_at).getTime() - Date.now(),
          });
          set({
            user: d.user,
            workspace: d.workspace,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Ignore errors on logout
        }
        clearTokens();
        set({
          user: null,
          workspace: null,
          workspaces: [],
          isAuthenticated: false,
        });
      },

      setUser: (user: User) => set({ user }),

      setWorkspace: (workspace: Workspace) => set({ workspace }),

      setWorkspaces: (workspaces: Workspace[]) => set({ workspaces }),

      setTokensAndUser: (tokens: AuthTokens, user: User, workspace: Workspace) => {
        setTokens(tokens);
        set({ user, workspace, isAuthenticated: true });
      },

      hydrate: async () => {
        loadTokensFromStorage();
        const { isAuthenticated } = get();
        if (!isAuthenticated) return;

        try {
          const res = await authApi.me();
          // Backend returns { data: { user: User, workspaces: [...] } }
          const payload = res as unknown as { data: { user: User; workspaces: Workspace[] } };
          const hydratedUser = payload.data?.user ?? (res.data as unknown as User);
          const hydratedWorkspaces = payload.data?.workspaces ?? [];
          set({ user: hydratedUser, workspaces: hydratedWorkspaces, isAuthenticated: true });
        } catch {
          clearTokens();
          set({ user: null, workspace: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: "sf-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        workspace: state.workspace,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
