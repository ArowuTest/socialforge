import {
  ApiResponse,
  PaginatedResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  User,
  Workspace,
  SocialAccount,
  Post,
  PostStatus,
  PostType,
  Platform,
  ScheduleSlot,
  CalendarEntry,
  AIJob,
  GenerateCaptionRequest,
  GenerateImageRequest,
  RepurposeRequest,
  Plan,
  BillingUsage,
  Subscription,
  WhitelabelConfig,
  Client,
  ApiKey,
  CreditPackage,
  CreditBalance,
  CreditLedgerEntry,
  CreditTopUpSession,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// Token management
let accessToken: string | null = null;
let refreshToken: string | null = null;
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

export function setTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  if (typeof window !== "undefined") {
    localStorage.setItem("sf_access_token", tokens.accessToken);
    localStorage.setItem("sf_refresh_token", tokens.refreshToken);
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("sf_access_token");
    localStorage.removeItem("sf_refresh_token");
  }
}

export function loadTokensFromStorage() {
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("sf_access_token");
    refreshToken = localStorage.getItem("sf_refresh_token");
  }
}

async function doRefreshToken(): Promise<string> {
  const rt = refreshToken ?? localStorage.getItem("sf_refresh_token");
  if (!rt) throw new Error("No refresh token available");

  const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });

  if (!res.ok) {
    clearTokens();
    throw new Error("Session expired. Please login again.");
  }

  const data: ApiResponse<AuthTokens> = await res.json();
  setTokens(data.data);
  return data.data.accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = accessToken ?? localStorage.getItem("sf_access_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retry) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken) => {
          headers["Authorization"] = `Bearer ${newToken}`;
          fetch(`${BASE_URL}${path}`, { ...options, headers })
            .then((r) => r.json())
            .then(resolve)
            .catch(reject);
        });
      });
    }

    isRefreshing = true;
    try {
      const newToken = await doRefreshToken();
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];
      isRefreshing = false;
      return request<T>(path, options, false);
    } catch (err) {
      refreshQueue = [];
      isRefreshing = false;
      throw err;
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(errorData.message ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============================================================
// Auth API
// ============================================================

export const authApi = {
  login: (data: LoginRequest) =>
    request<ApiResponse<{ user: User; workspace: Workspace; tokens: AuthTokens }>>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify(data) }
    ),

  register: (data: RegisterRequest) =>
    request<ApiResponse<{ user: User; workspace: Workspace; tokens: AuthTokens }>>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(data) }
    ),

  refreshToken: (token: string) =>
    request<ApiResponse<AuthTokens>>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    }),

  logout: () =>
    request<void>("/api/v1/auth/logout", { method: "POST" }),

  me: () =>
    request<ApiResponse<User>>("/api/v1/auth/me"),

  getApiKeys: () =>
    request<ApiResponse<ApiKey[]>>("/api/v1/auth/api-keys"),

  createApiKey: (data: { name: string; permissions?: string[] }) =>
    request<ApiResponse<ApiKey & { key: string }>>("/api/v1/auth/api-keys", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteApiKey: (id: string) =>
    request<void>(`/api/v1/auth/api-keys/${id}`, { method: "DELETE" }),
};

// ============================================================
// OAuth API
// ============================================================

export const oauthApi = {
  getConnectUrl: (platform: Platform, workspaceId: string) =>
    `${BASE_URL}/api/v1/oauth/${platform}/connect?workspaceId=${workspaceId}`,
};

// ============================================================
// Social Accounts API
// ============================================================

export const accountsApi = {
  list: (workspaceId: string) =>
    request<ApiResponse<SocialAccount[]>>(`/api/v1/workspaces/${workspaceId}/accounts`),

  disconnect: (workspaceId: string, id: string) =>
    request<void>(`/api/v1/workspaces/${workspaceId}/accounts/${id}`, { method: "DELETE" }),
};

// ============================================================
// Posts API
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const postsApi: Record<string, any> = {
  list: (
    workspaceId: string,
    params?: {
      status?: PostStatus;
      platform?: Platform;
      page?: number;
      pageSize?: number;
      startDate?: string;
      endDate?: string;
    }
  ) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<Post>>(
      `/api/v1/workspaces/${workspaceId}/posts?${query}`
    );
  },

  get: (workspaceId: string, id: string) =>
    request<ApiResponse<Post>>(`/api/v1/workspaces/${workspaceId}/posts/${id}`),

  create: (
    workspaceId: string,
    data: {
      caption: string;
      platforms: Platform[];
      mediaIds?: string[];
      scheduledAt?: string;
      postType: PostType;
      tags?: string[];
    }
  ) =>
    request<ApiResponse<Post>>(`/api/v1/workspaces/${workspaceId}/posts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (workspaceId: string, id: string, data: Partial<Post>) =>
    request<ApiResponse<Post>>(`/api/v1/workspaces/${workspaceId}/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (workspaceId: string, id: string) =>
    request<void>(`/api/v1/workspaces/${workspaceId}/posts/${id}`, { method: "DELETE" }),

  publishNow: (workspaceId: string, id: string) =>
    request<ApiResponse<Post>>(`/api/v1/workspaces/${workspaceId}/posts/${id}/publish`, {
      method: "POST",
    }),

  bulkCreate: (workspaceId: string, posts: Parameters<typeof postsApi.create>[1][]) =>
    request<ApiResponse<Post[]>>(`/api/v1/workspaces/${workspaceId}/posts/bulk`, {
      method: "POST",
      body: JSON.stringify({ posts }),
    }),
};

// ============================================================
// Schedule API
// ============================================================

export const scheduleApi = {
  getSlots: (workspaceId: string) =>
    request<ApiResponse<ScheduleSlot[]>>(`/api/v1/workspaces/${workspaceId}/schedule/slots`),

  createSlot: (
    workspaceId: string,
    data: {
      platform?: Platform;
      dayOfWeek: number;
      time: string;
      timezone: string;
    }
  ) =>
    request<ApiResponse<ScheduleSlot>>(`/api/v1/workspaces/${workspaceId}/schedule/slots`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSlot: (workspaceId: string, id: string) =>
    request<void>(`/api/v1/workspaces/${workspaceId}/schedule/slots/${id}`, {
      method: "DELETE",
    }),

  getNextSlot: (workspaceId: string, platform?: Platform) => {
    const query = platform ? `?platform=${platform}` : "";
    return request<ApiResponse<{ slot: ScheduleSlot; scheduledAt: string }>>(
      `/api/v1/workspaces/${workspaceId}/schedule/next-slot${query}`
    );
  },

  getCalendar: (workspaceId: string, startDate: string, endDate: string) =>
    request<ApiResponse<CalendarEntry[]>>(
      `/api/v1/workspaces/${workspaceId}/schedule/calendar?startDate=${startDate}&endDate=${endDate}`
    ),
};

// ============================================================
// AI API
// ============================================================

export const aiApi = {
  generateCaption: (workspaceId: string, data: GenerateCaptionRequest) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/ai/generate-caption`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateImage: (workspaceId: string, data: GenerateImageRequest) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/ai/generate-image`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateVideo: (
    workspaceId: string,
    data: {
      concept: string;
      duration: 15 | 30 | 60;
      style: string;
    }
  ) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/ai/generate-video`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  repurpose: (workspaceId: string, data: RepurposeRequest) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/ai/repurpose`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  analyse: (
    workspaceId: string,
    data: { postId?: string; content?: string; platform: Platform }
  ) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/ai/analyse`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getJobStatus: (workspaceId: string, jobId: string) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/ai/jobs/${jobId}`),
};

// ============================================================
// Analytics API
// ============================================================

export const analyticsApi = {
  getOverview: (
    workspaceId: string,
    params: { startDate: string; endDate: string }
  ) =>
    request<
      ApiResponse<{
        totalPosts: number;
        totalReach: number;
        totalEngagement: number;
        bestPlatform: string;
        postsPerDay: Array<{ date: string; count: number }>;
        engagementByPlatform: Array<{ platform: string; engagement: number }>;
        platformBreakdown: Array<{ platform: string; posts: number; reach: number }>;
      }>
    >(
      `/api/v1/workspaces/${workspaceId}/analytics?startDate=${params.startDate}&endDate=${params.endDate}`
    ),
};

// ============================================================
// Billing API
// ============================================================

export const billingApi = {
  getPlans: () =>
    request<ApiResponse<Plan[]>>("/api/v1/billing/plans"),

  createSubscription: (data: { planType: string; interval: "monthly" | "yearly" }) =>
    request<ApiResponse<{ checkoutUrl: string }>>("/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getPortalUrl: () =>
    request<ApiResponse<{ url: string }>>("/api/v1/billing/portal", { method: "POST" }),

  getUsage: () =>
    request<ApiResponse<BillingUsage>>("/api/v1/billing/usage"),

  getCreditPackages: () =>
    request<{ currency: string; packages: CreditPackage[] }>(
      "/api/v1/billing/credits/packages"
    ),

  initiateCreditTopUp: (workspaceId: string, packageId: string) =>
    request<CreditTopUpSession>(
      `/api/v1/workspaces/${workspaceId}/billing/credits/topup`,
      {
        method: "POST",
        body: JSON.stringify({ package_id: packageId }),
      }
    ),

  getCreditBalance: (workspaceId: string) =>
    request<{ data: CreditBalance }>(
      `/api/v1/workspaces/${workspaceId}/billing/credits/balance`
    ),

  getCreditLedger: (
    workspaceId: string,
    params?: { limit?: number; offset?: number }
  ) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return request<{ data: CreditLedgerEntry[]; total: number }>(
      `/api/v1/workspaces/${workspaceId}/billing/credits/ledger?${q}`
    );
  },

  getWorkspaceUsage: (workspaceId: string) =>
    request<ApiResponse<BillingUsage>>(
      `/api/v1/workspaces/${workspaceId}/billing/usage`
    ),
};

// ============================================================
// Media API
// ============================================================

export const mediaApi = {
  presign: (workspaceId: string, data: { filename: string; contentType: string }) =>
    request<ApiResponse<{ uploadUrl: string; key: string }>>(
      `/api/v1/workspaces/${workspaceId}/media/presign`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  list: (workspaceId: string) =>
    request<ApiResponse<Array<{ key: string; url: string; size: number; createdAt: string }>>>(
      `/api/v1/workspaces/${workspaceId}/media`
    ),

  delete: (workspaceId: string, key: string) =>
    request<void>(`/api/v1/workspaces/${workspaceId}/media/${key}`, {
      method: "DELETE",
    }),
};

// ============================================================
// White-label API
// ============================================================

export const whitelabelApi = {
  getConfig: (workspaceId: string) =>
    request<ApiResponse<WhitelabelConfig>>(
      `/api/v1/workspaces/${workspaceId}/whitelabel`
    ),

  updateConfig: (workspaceId: string, data: Partial<WhitelabelConfig>) =>
    request<ApiResponse<WhitelabelConfig>>(
      `/api/v1/workspaces/${workspaceId}/whitelabel`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  listClients: (
    workspaceId: string,
    params?: { page?: number; pageSize?: number }
  ) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<Client>>(
      `/api/v1/workspaces/${workspaceId}/clients?${query}`
    );
  },

  createClient: (
    workspaceId: string,
    data: {
      name: string;
      email: string;
      plan: string;
    }
  ) =>
    request<ApiResponse<Client>>(`/api/v1/workspaces/${workspaceId}/clients`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  removeClient: (workspaceId: string, clientId: string) =>
    request<void>(`/api/v1/workspaces/${workspaceId}/clients/${clientId}`, {
      method: "DELETE",
    }),
};

// ============================================================
// Repurpose API
// ============================================================

export const repurposeApi = {
  repurpose: (workspaceId: string, data: RepurposeRequest) =>
    request<ApiResponse<AIJob>>(`/api/v1/workspaces/${workspaceId}/repurpose`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ============================================================
// Admin API (super-admin only)
// ============================================================

export const adminApi = {
  getStats: () =>
    request<ApiResponse<Record<string, unknown>>>("/api/v1/admin/stats"),

  listUsers: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<User>>(`/api/v1/admin/users?${query}`);
  },

  getUser: (id: string) =>
    request<ApiResponse<User>>(`/api/v1/admin/users/${id}`),

  suspendUser: (id: string) =>
    request<ApiResponse<User>>(`/api/v1/admin/users/${id}/suspend`, {
      method: "POST",
    }),

  listWorkspaces: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<Workspace>>(`/api/v1/admin/workspaces?${query}`);
  },

  listAiJobs: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<AIJob>>(`/api/v1/admin/ai-jobs?${query}`);
  },

  getAuditLogs: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<Record<string, unknown>>>(
      `/api/v1/admin/audit-logs?${query}`
    );
  },

  getRevenue: () =>
    request<ApiResponse<Record<string, unknown>>>("/api/v1/admin/revenue"),

  grantCredits: (data: { userId: string; amount: number; reason?: string }) =>
    request<ApiResponse<Record<string, unknown>>>("/api/v1/admin/grant-credits", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  grantPlan: (data: { userId: string; planType: string; expiresAt?: string }) =>
    request<ApiResponse<Record<string, unknown>>>("/api/v1/admin/grant-plan", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ============================================================
// Backwards-compat layer
// ----------------------------------------------------------------
// The dashboard pages were written against an earlier API client that:
//   - did not require workspaceId as the first argument
//   - had a separate `workspaceApi` and `apiKeysApi`
//   - exposed extra methods that have since been removed or moved
//
// Rather than rewrite every page in lock-step with the new client, this
// shim lets both shapes coexist. Legacy calls resolve the active
// workspace ID from the zustand auth store persisted in localStorage.
// New call sites that pass workspaceId explicitly still work unchanged.
//
// TODO: migrate each dashboard page to the canonical api.ts shape and
// delete this section.
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function getActiveWorkspaceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("sf-auth");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.state?.workspace?.id ?? "";
  } catch {
    return "";
  }
}

function resolveArgs<T extends any[]>(args: any[]): [string, ...T] {
  // If the first arg is a string that looks like a UUID/workspace id, use it.
  // Otherwise fall back to the active workspace from the auth store.
  if (typeof args[0] === "string" && args[0].length > 0 && !args[0].startsWith("{")) {
    return args as [string, ...T];
  }
  return [getActiveWorkspaceId(), ...args] as [string, ...T];
}

// ---- accountsApi additions ----
const originalAccountsList = accountsApi.list.bind(accountsApi);
const originalAccountsDisconnect = accountsApi.disconnect.bind(accountsApi);

Object.assign(accountsApi, {
  list: (...args: any[]) => {
    const [wsId] = resolveArgs(args);
    return originalAccountsList(wsId);
  },
  disconnect: (...args: any[]) => {
    const [wsId, id] = resolveArgs<[string]>(args);
    return originalAccountsDisconnect(wsId, id);
  },
  refresh: (id?: string) => {
    const wsId = getActiveWorkspaceId();
    return request<ApiResponse<SocialAccount>>(
      `/api/v1/workspaces/${wsId}/accounts/${id}/refresh`,
      { method: "POST" }
    );
  },
  getOAuthUrl: (platform: Platform) => {
    const wsId = getActiveWorkspaceId();
    return Promise.resolve({
      data: { url: oauthApi.getConnectUrl(platform, wsId) },
    });
  },
});

// ---- aiApi additions ----
const originalAiGenerateCaption = aiApi.generateCaption.bind(aiApi);
const originalAiGenerateImage = aiApi.generateImage.bind(aiApi);
const originalAiGenerateVideo = aiApi.generateVideo.bind(aiApi);
const originalAiRepurpose = aiApi.repurpose.bind(aiApi);
const originalAiAnalyse = aiApi.analyse.bind(aiApi);

Object.assign(aiApi, {
  generateCaption: (...args: any[]) => {
    const [wsId, data] = resolveArgs<[GenerateCaptionRequest]>(args);
    return originalAiGenerateCaption(wsId, data);
  },
  generateImage: (...args: any[]) => {
    const [wsId, data] = resolveArgs<[GenerateImageRequest]>(args);
    return originalAiGenerateImage(wsId, data);
  },
  generateVideo: (...args: any[]) => {
    const [wsId, data] = resolveArgs<[{ concept: string; duration: 15 | 30 | 60; style: string }]>(args);
    return originalAiGenerateVideo(wsId, data);
  },
  repurpose: (...args: any[]) => {
    const [wsId, data] = resolveArgs<[RepurposeRequest]>(args);
    return originalAiRepurpose(wsId, data);
  },
  analyse: (...args: any[]) => {
    const [wsId, data] = resolveArgs<[{ postId?: string; content?: string; platform: Platform }]>(args);
    return originalAiAnalyse(wsId, data);
  },
  addHashtags: (data: { content: string; platform: Platform; count?: number }) => {
    const wsId = getActiveWorkspaceId();
    return request<ApiResponse<AIJob>>(
      `/api/v1/workspaces/${wsId}/ai/hashtags`,
      { method: "POST", body: JSON.stringify(data) }
    );
  },
  getCreditsUsage: () => {
    const wsId = getActiveWorkspaceId();
    return request<ApiResponse<{ used: number; limit: number; resetAt: string }>>(
      `/api/v1/workspaces/${wsId}/ai/credits`
    );
  },
});

// ---- postsApi legacy shape support ----
const originalPostsList = postsApi.list.bind(postsApi);
const originalPostsCreate = postsApi.create.bind(postsApi);
const originalPostsUpdate = postsApi.update.bind(postsApi);
const originalPostsDelete = postsApi.delete.bind(postsApi);
const originalPostsGet = postsApi.get.bind(postsApi);

Object.assign(postsApi, {
  list: (...args: any[]) => {
    const [wsId, params] = resolveArgs<[any?]>(args);
    return originalPostsList(wsId, params);
  },
  get: (...args: any[]) => {
    const [wsId, id] = resolveArgs<[string]>(args);
    return originalPostsGet(wsId, id);
  },
  create: (...args: any[]) => {
    const [wsId, data] = resolveArgs<[any]>(args);
    return originalPostsCreate(wsId, data);
  },
  update: (...args: any[]) => {
    // Old shape: update(id, data)  → new shape: update(wsId, id, data)
    if (args.length === 2) {
      return originalPostsUpdate(getActiveWorkspaceId(), args[0], args[1]);
    }
    return originalPostsUpdate(args[0], args[1], args[2]);
  },
  delete: (...args: any[]) => {
    const [wsId, id] = resolveArgs<[string]>(args);
    return originalPostsDelete(wsId, id);
  },
});

// ---- analyticsApi additions ----
const originalAnalyticsOverview = analyticsApi.getOverview.bind(analyticsApi);

Object.assign(analyticsApi, {
  getOverview: (...args: any[]) => {
    if (args.length === 1 && typeof args[0] === "object") {
      return originalAnalyticsOverview(getActiveWorkspaceId(), args[0]);
    }
    return originalAnalyticsOverview(args[0], args[1]);
  },
  getTopPosts: (params?: { startDate: string; endDate: string; limit?: number }) => {
    const wsId = getActiveWorkspaceId();
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) q.set(k, String(v));
      });
    }
    return request<ApiResponse<Post[]>>(
      `/api/v1/workspaces/${wsId}/analytics/top-posts?${q}`
    );
  },
});

// ---- billingApi additions ----
Object.assign(billingApi, {
  getSubscription: () =>
    request<ApiResponse<Subscription>>("/api/v1/billing/subscription"),
});

// ---- workspaceApi (new export, legacy shape) ----
export const workspaceApi: Record<string, any> = {
  get: (id?: string) => {
    const wsId = id ?? getActiveWorkspaceId();
    return request<ApiResponse<Workspace>>(`/api/v1/workspaces/${wsId}`);
  },
  update: (idOrData: string | Partial<Workspace>, maybeData?: Partial<Workspace>) => {
    const wsId = typeof idOrData === "string" ? idOrData : getActiveWorkspaceId();
    const data = typeof idOrData === "string" ? maybeData : idOrData;
    return request<ApiResponse<Workspace>>(`/api/v1/workspaces/${wsId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  listMembers: (id?: string) => {
    const wsId = id ?? getActiveWorkspaceId();
    return request<ApiResponse<Array<{ id: string; email: string; name: string; role: string }>>>(
      `/api/v1/workspaces/${wsId}/members`
    );
  },
  inviteMember: (data: { email: string; role: string }) => {
    const wsId = getActiveWorkspaceId();
    return request<ApiResponse<Record<string, unknown>>>(
      `/api/v1/workspaces/${wsId}/members/invite`,
      { method: "POST", body: JSON.stringify(data) }
    );
  },
  removeMember: (memberId: string) => {
    const wsId = getActiveWorkspaceId();
    return request<void>(`/api/v1/workspaces/${wsId}/members/${memberId}`, {
      method: "DELETE",
    });
  },
  updateMemberRole: (memberId: string, role: string) => {
    const wsId = getActiveWorkspaceId();
    return request<ApiResponse<Record<string, unknown>>>(
      `/api/v1/workspaces/${wsId}/members/${memberId}`,
      { method: "PATCH", body: JSON.stringify({ role }) }
    );
  },
};

// ---- apiKeysApi (new export, alias to authApi) ----
export const apiKeysApi: Record<string, any> = {
  list: () => authApi.getApiKeys(),
  create: (data: { name: string; permissions?: string[] }) => authApi.createApiKey(data),
  delete: (id: string) => authApi.deleteApiKey(id),
};

/* eslint-enable @typescript-eslint/no-explicit-any */
