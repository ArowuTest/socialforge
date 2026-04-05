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

  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
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
      "/api/auth/login",
      { method: "POST", body: JSON.stringify(data) }
    ),

  register: (data: RegisterRequest) =>
    request<ApiResponse<{ user: User; workspace: Workspace; tokens: AuthTokens }>>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify(data) }
    ),

  refreshToken: (token: string) =>
    request<ApiResponse<AuthTokens>>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    }),

  logout: () =>
    request<void>("/api/auth/logout", { method: "POST" }),

  getOAuthUrl: (provider: string) =>
    request<ApiResponse<{ url: string }>>(`/api/auth/oauth/${provider}`),

  me: () =>
    request<ApiResponse<User>>("/api/auth/me"),
};

// ============================================================
// Posts API
// ============================================================

export const postsApi = {
  list: (params?: {
    status?: PostStatus;
    platform?: Platform;
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<Post>>(`/api/posts?${query}`);
  },

  get: (id: string) =>
    request<ApiResponse<Post>>(`/api/posts/${id}`),

  create: (data: {
    caption: string;
    platforms: Platform[];
    mediaIds?: string[];
    scheduledAt?: string;
    postType: PostType;
    tags?: string[];
  }) =>
    request<ApiResponse<Post>>("/api/posts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Post>) =>
    request<ApiResponse<Post>>(`/api/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/api/posts/${id}`, { method: "DELETE" }),

  publishNow: (id: string) =>
    request<ApiResponse<Post>>(`/api/posts/${id}/publish`, { method: "POST" }),

  reschedule: (id: string, scheduledAt: string) =>
    request<ApiResponse<Post>>(`/api/posts/${id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt }),
    }),

  bulkCreate: (posts: Parameters<typeof postsApi.create>[0][]) =>
    request<ApiResponse<Post[]>>("/api/posts/bulk", {
      method: "POST",
      body: JSON.stringify({ posts }),
    }),

  getCalendar: (month: string) =>
    request<ApiResponse<CalendarEntry[]>>(`/api/posts/calendar?month=${month}`),
};

// ============================================================
// Social Accounts API
// ============================================================

export const accountsApi = {
  list: () =>
    request<ApiResponse<SocialAccount[]>>("/api/accounts"),

  disconnect: (id: string) =>
    request<void>(`/api/accounts/${id}`, { method: "DELETE" }),

  getOAuthUrl: (platform: Platform, workspaceId: string) =>
    request<ApiResponse<{ url: string }>>(
      `/api/accounts/oauth/${platform}?workspaceId=${workspaceId}`
    ),

  refresh: (id: string) =>
    request<ApiResponse<SocialAccount>>(`/api/accounts/${id}/refresh`, {
      method: "POST",
    }),
};

// ============================================================
// Schedule API
// ============================================================

export const scheduleApi = {
  getSlots: () =>
    request<ApiResponse<ScheduleSlot[]>>("/api/schedule/slots"),

  createSlot: (data: {
    platform?: Platform;
    dayOfWeek: number;
    time: string;
    timezone: string;
  }) =>
    request<ApiResponse<ScheduleSlot>>("/api/schedule/slots", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSlot: (id: string) =>
    request<void>(`/api/schedule/slots/${id}`, { method: "DELETE" }),

  getCalendar: (startDate: string, endDate: string) =>
    request<ApiResponse<CalendarEntry[]>>(
      `/api/schedule/calendar?startDate=${startDate}&endDate=${endDate}`
    ),

  getNextSlot: (platform?: Platform) => {
    const query = platform ? `?platform=${platform}` : "";
    return request<ApiResponse<{ slot: ScheduleSlot; scheduledAt: string }>>(
      `/api/schedule/next${query}`
    );
  },
};

// ============================================================
// AI API
// ============================================================

export const aiApi = {
  generateCaption: (data: GenerateCaptionRequest) =>
    request<ApiResponse<AIJob>>("/api/ai/caption", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateImage: (data: GenerateImageRequest) =>
    request<ApiResponse<AIJob>>("/api/ai/image", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateVideo: (data: {
    concept: string;
    duration: 15 | 30 | 60;
    style: string;
  }) =>
    request<ApiResponse<AIJob>>("/api/ai/video", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  repurpose: (data: RepurposeRequest) =>
    request<ApiResponse<AIJob>>("/api/ai/repurpose", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  analyseViral: (data: { postId?: string; content?: string; platform: Platform }) =>
    request<ApiResponse<AIJob>>("/api/ai/analyse-viral", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  improveCaption: (data: { caption: string; platform: Platform; instruction?: string }) =>
    request<ApiResponse<AIJob>>("/api/ai/improve", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  addHashtags: (data: { caption: string; platform: Platform; count?: number }) =>
    request<ApiResponse<AIJob>>("/api/ai/hashtags", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getJobStatus: (jobId: string) =>
    request<ApiResponse<AIJob>>(`/api/ai/jobs/${jobId}`),

  getCreditsUsage: () =>
    request<ApiResponse<{ used: number; limit: number; resetAt: string }>>(
      "/api/ai/credits"
    ),
};

// ============================================================
// Billing API
// ============================================================

export const billingApi = {
  getPlans: () =>
    request<ApiResponse<Plan[]>>("/api/billing/plans"),

  getSubscription: () =>
    request<ApiResponse<Subscription>>("/api/billing/subscription"),

  createSubscription: (data: { planType: string; interval: "monthly" | "yearly" }) =>
    request<ApiResponse<{ checkoutUrl: string }>>("/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getPortalUrl: () =>
    request<ApiResponse<{ url: string }>>("/api/billing/portal"),

  getUsage: () =>
    request<ApiResponse<BillingUsage>>("/api/billing/usage"),

  cancelSubscription: () =>
    request<ApiResponse<Subscription>>("/api/billing/cancel", { method: "POST" }),
};

// ============================================================
// White-label API
// ============================================================

export const whitelabelApi = {
  getConfig: () =>
    request<ApiResponse<WhitelabelConfig>>("/api/whitelabel"),

  updateConfig: (data: Partial<WhitelabelConfig>) =>
    request<ApiResponse<WhitelabelConfig>>("/api/whitelabel", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  listClients: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    return request<PaginatedResponse<Client>>(`/api/agency/clients?${query}`);
  },

  createClient: (data: {
    name: string;
    email: string;
    plan: string;
  }) =>
    request<ApiResponse<Client>>("/api/agency/clients", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  impersonateClient: (clientId: string) =>
    request<ApiResponse<{ token: string }>>(`/api/agency/clients/${clientId}/impersonate`, {
      method: "POST",
    }),

  removeClient: (clientId: string) =>
    request<void>(`/api/agency/clients/${clientId}`, { method: "DELETE" }),
};

// ============================================================
// Workspace API
// ============================================================

export const workspaceApi = {
  get: (id: string) =>
    request<ApiResponse<Workspace>>(`/api/workspaces/${id}`),

  list: () =>
    request<ApiResponse<Workspace[]>>("/api/workspaces"),

  update: (id: string, data: Partial<Workspace>) =>
    request<ApiResponse<Workspace>>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  create: (data: { name: string; slug?: string; timezone?: string }) =>
    request<ApiResponse<Workspace>>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ============================================================
// API Keys API
// ============================================================

export const apiKeysApi = {
  list: () =>
    request<ApiResponse<ApiKey[]>>("/api/keys"),

  create: (data: { name: string; permissions?: string[] }) =>
    request<ApiResponse<ApiKey & { key: string }>>("/api/keys", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  revoke: (id: string) =>
    request<void>(`/api/keys/${id}`, { method: "DELETE" }),
};

// ============================================================
// Analytics API
// ============================================================

export const analyticsApi = {
  getOverview: (params: { startDate: string; endDate: string }) =>
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
    >(`/api/analytics/overview?startDate=${params.startDate}&endDate=${params.endDate}`),

  getTopPosts: (params: { startDate: string; endDate: string; limit?: number }) => {
    const query = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      ...(params.limit ? { limit: String(params.limit) } : {}),
    });
    return request<ApiResponse<Post[]>>(`/api/analytics/top-posts?${query}`);
  },
};
