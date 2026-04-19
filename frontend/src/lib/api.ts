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
  Automation,
  CreateAutomationRequest,
  BrandKit,
  CreateBrandKitRequest,
  Campaign,
  CampaignPost,
  CreateCampaignRequest,
} from "@/types";

// AdminCampaign extends Campaign with workspace_name from the JOIN query.
export interface AdminCampaign extends Campaign {
  workspace_name: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ============================================================
// Token management + HTTP
// ============================================================

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
    // Set a cookie so Next.js middleware can detect the authenticated session
    // without needing to read localStorage (which is not available server-side).
    document.cookie = `sf_logged_in=1; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("sf_access_token");
    localStorage.removeItem("sf_refresh_token");
    // Clear the middleware auth cookie.
    document.cookie = "sf_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

export function loadTokensFromStorage() {
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("sf_access_token");
    refreshToken = localStorage.getItem("sf_refresh_token");
  }
}

/**
 * Resolves the active workspace ID from the zustand auth store persisted in
 * localStorage. Used by API methods so call sites never need to pass the
 * workspace id explicitly — the dashboard always operates on exactly one
 * active workspace at a time.
 */
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

async function doRefreshToken(): Promise<string> {
  const rt = refreshToken ?? localStorage.getItem("sf_refresh_token");
  if (!rt) throw new Error("No refresh token available");

  const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  });

  if (!res.ok) {
    clearTokens();
    // Redirect to login so the user can re-authenticate.
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please login again.");
  }

  const raw = await res.json();
  const d = raw.data as { access_token: string; refresh_token: string; expires_at: string };
  setTokens({
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresIn: new Date(d.expires_at).getTime() - Date.now(),
  });
  return d.access_token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = accessToken ?? (typeof window !== "undefined" ? localStorage.getItem("sf_access_token") : null);

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

/** Build a query string, skipping undefined/null values. */
function qs(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Prefix for workspace-scoped endpoints, resolving the active workspace. */
function ws(): string {
  return `/api/v1/workspaces/${getActiveWorkspaceId()}`;
}

// ============================================================
// Auth API
// ============================================================

export const authApi = {
  login: (data: LoginRequest) =>
    request<ApiResponse<{ user: User; workspace: Workspace; tokens: AuthTokens }>>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify(data) },
    ),

  register: (data: RegisterRequest) =>
    request<ApiResponse<{ user: User; workspace: Workspace; tokens: AuthTokens }>>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(data) },
    ),

  refreshToken: (token: string) =>
    request<ApiResponse<AuthTokens>>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: token }),
    }),

  logout: () => request<void>("/api/v1/auth/logout", { method: "POST" }),

  me: () => request<ApiResponse<User>>("/api/v1/auth/me"),

  updateProfile: (data: { name: string }) =>
    request<ApiResponse<User>>("/api/v1/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<ApiResponse<{ message: string }>>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  requestPasswordReset: (email: string) =>
    request<ApiResponse<{ message: string }>>("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: (token: string, newPassword: string) =>
    request<ApiResponse<{ message: string }>>("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password: newPassword }),
    }),

  acceptInvite: (token: string) =>
    request<ApiResponse<{ workspace_id: string; role: string }>>(
      "/api/v1/auth/accept-invite",
      { method: "POST", body: JSON.stringify({ token }) },
    ),
};

// ============================================================
// API Keys (workspace-less, user-scoped via JWT)
// ============================================================

export const apiKeysApi = {
  list: () => request<ApiResponse<ApiKey[]>>("/api/v1/auth/api-keys"),

  create: (data: { name: string; permissions?: string[] }) =>
    request<ApiResponse<ApiKey & { key: string }>>("/api/v1/auth/api-keys", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Delete an API key. `revoke` is an alias kept for older call sites. */
  delete: (id: string) =>
    request<void>(`/api/v1/auth/api-keys/${id}`, { method: "DELETE" }),

  revoke: (id: string) =>
    request<void>(`/api/v1/auth/api-keys/${id}`, { method: "DELETE" }),
};

// ============================================================
// OAuth helper
// ============================================================

export const oauthApi = {
  getConnectUrl: (platform: Platform | string, workspaceId?: string) => {
    const wsId = workspaceId ?? getActiveWorkspaceId();
    return `${BASE_URL}/api/v1/oauth/${platform}/connect?workspaceId=${wsId}`;
  },
};

// ============================================================
// Workspace + members
// ============================================================

export const workspaceApi = {
  get: (id?: string) => {
    const wsId = id ?? getActiveWorkspaceId();
    return request<ApiResponse<Workspace>>(`/api/v1/workspaces/${wsId}`);
  },

  update: (
    idOrData: string | Partial<Workspace>,
    maybeData?: Partial<Workspace>,
  ) => {
    const wsId = typeof idOrData === "string" ? idOrData : getActiveWorkspaceId();
    const data = typeof idOrData === "string" ? maybeData : idOrData;
    return request<ApiResponse<Workspace>>(`/api/v1/workspaces/${wsId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  listMembers: (id?: string) => {
    const wsId = id ?? getActiveWorkspaceId();
    return request<
      ApiResponse<
        Array<{ id: string; user_id: string; email: string; name: string; role: string }>
      >
    >(`/api/v1/workspaces/${wsId}/members`);
  },

  inviteMember: (data: { email: string; role: string }) =>
    request<ApiResponse<{ status?: string; email?: string; message?: string }>>(
      `${ws()}/members/invite`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  updateMemberRole: (memberId: string, role: string) =>
    request<ApiResponse<{ id: string; role: string }>>(
      `${ws()}/members/${memberId}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),

  removeMember: (memberId: string) =>
    request<void>(`${ws()}/members/${memberId}`, { method: "DELETE" }),
};

// ============================================================
// Social accounts
// ============================================================

export const accountsApi = {
  list: () => request<ApiResponse<SocialAccount[]>>(`${ws()}/accounts`),

  disconnect: (id: string) =>
    request<void>(`${ws()}/accounts/${id}`, { method: "DELETE" }),

  refresh: (id: string) =>
    request<ApiResponse<SocialAccount>>(`${ws()}/accounts/${id}/refresh`, {
      method: "POST",
    }),

  /** Fetch the OAuth initiation URL from the backend (auth-protected). */
  getOAuthUrl: (platform: Platform | string) =>
    request<ApiResponse<{ url: string }>>(
      `/api/v1/oauth/${platform}/connect?workspace_id=${getActiveWorkspaceId()}`,
    ),

  /** Connect a Bluesky account using handle + app password. */
  connectBluesky: (handle: string, appPassword: string) =>
    request<ApiResponse<SocialAccount>>(
      `${BASE_URL}/api/v1/oauth/bluesky/connect`,
      {
        method: "POST",
        body: JSON.stringify({ handle, appPassword }),
      },
    ),
};

// ============================================================
// Posts
// ============================================================

interface PostCreatePayload {
  caption: string;
  platforms: Platform[];
  mediaUrls?: string[];   // public URLs from presigned upload
  scheduledAt?: string;
  useNextSlot?: boolean;
  postType: PostType;
  tags?: string[];
}

export const postsApi = {
  list: (params?: {
    status?: PostStatus;
    platform?: Platform;
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
  }) => request<PaginatedResponse<Post>>(`${ws()}/posts${qs(params)}`),

  get: (id: string) => request<ApiResponse<Post>>(`${ws()}/posts/${id}`),

  create: (data: PostCreatePayload) =>
    request<ApiResponse<Post>>(`${ws()}/posts`, {
      method: "POST",
      // Remap camelCase frontend fields to snake_case backend fields
      body: JSON.stringify({
        content: data.caption,
        platforms: data.platforms,
        post_type: data.postType,
        ...(data.scheduledAt && { scheduled_at: data.scheduledAt }),
        ...(data.useNextSlot && { use_next_free_slot: true }),
        ...(data.mediaUrls?.length && { media_urls: data.mediaUrls }),
      }),
    }),

  update: (id: string, data: Partial<Post>) =>
    request<ApiResponse<Post>>(`${ws()}/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`${ws()}/posts/${id}`, { method: "DELETE" }),

  publishNow: (id: string) =>
    request<ApiResponse<Post>>(`${ws()}/posts/${id}/publish`, { method: "POST" }),

  bulkCreate: (posts: PostCreatePayload[]) =>
    request<ApiResponse<Post[]>>(`${ws()}/posts/bulk`, {
      method: "POST",
      body: JSON.stringify({ posts }),
    }),

  /**
   * Fetch calendar entries for a given month (YYYY-MM). Convenience wrapper
   * around the schedule/calendar endpoint used by the dashboard calendar view.
   */
  getCalendar: (monthKey: string) => {
    const [year, month] = monthKey.split("-").map((n) => parseInt(n, 10));
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    return request<ApiResponse<CalendarEntry[]>>(
      `${ws()}/schedule/calendar?from=${from}&to=${to}`,
    );
  },
};

// ============================================================
// Schedule
// ============================================================

export const scheduleApi = {
  getSlots: () =>
    request<ApiResponse<ScheduleSlot[]>>(`${ws()}/schedule/slots`),

  createSlot: (data: {
    platform: Platform | string;
    dayOfWeek: number;
    time: string;
    timezone: string;
  }) =>
    request<ApiResponse<ScheduleSlot>>(`${ws()}/schedule/slots`, {
      method: "POST",
      body: JSON.stringify({
        platform: data.platform,
        day_of_week: data.dayOfWeek,
        time_of_day: data.time,
        timezone: data.timezone,
      }),
    }),

  deleteSlot: (id: string) =>
    request<void>(`${ws()}/schedule/slots/${id}`, { method: "DELETE" }),

  getNextSlot: (platform?: Platform) =>
    request<ApiResponse<{ slot: ScheduleSlot; scheduledAt: string }>>(
      `${ws()}/schedule/next-slot${qs({ platform })}`,
    ),

  getCalendar: (from: string, to: string) =>
    request<ApiResponse<CalendarEntry[]>>(
      `${ws()}/schedule/calendar?from=${from}&to=${to}`,
    ),
};

// ============================================================
// AI
// ============================================================

export const aiApi = {
  generateCaption: (data: GenerateCaptionRequest) =>
    request<ApiResponse<AIJob>>(`${ws()}/ai/generate-caption`, {
      method: "POST",
      // Backend expects `prompt` (not `topic`) and snake_case `target_audience`
      body: JSON.stringify({
        prompt: data.topic,
        platform: data.platform,
        tone: data.tone,
        target_audience: data.targetAudience,
      }),
    }),

  generateImage: (data: GenerateImageRequest) =>
    request<ApiResponse<AIJob>>(`${ws()}/ai/generate-image`, {
      method: "POST",
      // Backend expects snake_case `aspect_ratio`
      body: JSON.stringify({
        prompt: data.prompt,
        style: data.style,
        aspect_ratio: data.aspectRatio,
      }),
    }),

  generateVideo: (data: { concept: string; duration: 5 | 10; style: string }) =>
    request<ApiResponse<AIJob>>(`${ws()}/ai/generate-video`, {
      method: "POST",
      // Backend expects `prompt` (not `concept`)
      body: JSON.stringify({
        prompt: data.concept,
        duration: data.duration,
        style: data.style,
      }),
    }),

  repurpose: (data: RepurposeRequest) =>
    request<ApiResponse<AIJob>>(`${ws()}/repurpose`, {
      method: "POST",
      // Backend expects snake_case `target_platforms`
      body: JSON.stringify({
        content: data.content,
        target_platforms: data.targetPlatforms,
      }),
    }),

  analyse: (data: { postId?: string; content?: string; platform: Platform }) =>
    request<ApiResponse<AIJob>>(`${ws()}/ai/analyse`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  addHashtags: (data: { content: string; platform: Platform; count?: number }) =>
    request<ApiResponse<{ hashtags: string[] }>>(`${ws()}/ai/hashtags`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getJobStatus: (jobId: string) =>
    request<ApiResponse<AIJob>>(`${ws()}/ai/jobs/${jobId}`),

  /**
   * Adapts the credit balance endpoint to the legacy {used, limit, resetAt}
   * shape consumed by the AI dashboard sidebar.
   */
  getCreditsUsage: async (): Promise<
    ApiResponse<{ used: number; limit: number; resetAt: string }>
  > => {
    try {
      const res = await request<{ data: CreditBalance }>(
        `${ws()}/billing/credits/balance`,
      );
      const b = res.data;
      return {
        success: true,
        data: {
          used: b.plan_credits_used,
          limit: b.plan_credits_limit,
          resetAt: "",
        },
      };
    } catch {
      return { success: true, data: { used: 0, limit: 0, resetAt: "" } };
    }
  },
};

// ============================================================
// Analytics
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
    >(`${ws()}/analytics${qs(params)}`),

  getTopPosts: (params?: { startDate?: string; endDate?: string; limit?: number }) =>
    request<ApiResponse<Post[]>>(`${ws()}/analytics/top-posts${qs(params)}`),
};

// ============================================================
// Billing
// ============================================================

export const billingApi = {
  getPlans: () => request<ApiResponse<Plan[]>>("/api/v1/billing/plans"),

  createSubscription: (data: { planType: string; interval: "monthly" | "yearly" }) =>
    request<ApiResponse<{ checkoutUrl: string }>>("/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getPortalUrl: () =>
    request<ApiResponse<{ url: string }>>("/api/v1/billing/portal", { method: "POST" }),

  getUsage: () => request<ApiResponse<BillingUsage>>("/api/v1/billing/usage"),

  getSubscription: () =>
    request<ApiResponse<Subscription>>("/api/v1/billing/subscription"),

  getWorkspaceUsage: () =>
    request<ApiResponse<BillingUsage>>(`${ws()}/billing/usage`),

  getCreditPackages: () =>
    request<{ currency: string; packages: CreditPackage[] }>(
      "/api/v1/billing/credits/packages",
    ),

  initiateCreditTopUp: (packageId: string) =>
    request<CreditTopUpSession>(`${ws()}/billing/credits/topup`, {
      method: "POST",
      body: JSON.stringify({ package_id: packageId }),
    }),

  getCreditBalance: () =>
    request<{ data: CreditBalance }>(`${ws()}/billing/credits/balance`),

  getCreditLedger: (params?: { limit?: number; offset?: number }) =>
    request<{ data: CreditLedgerEntry[]; total: number }>(
      `${ws()}/billing/credits/ledger${qs(params)}`,
    ),
};

// ============================================================
// Media
// ============================================================

export const mediaApi = {
  presign: (data: { filename: string; contentType: string }) =>
    request<ApiResponse<{ upload_url: string; key: string; public_url: string }>>(
      `${ws()}/media/presign`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  list: () =>
    request<
      ApiResponse<Array<{ id: string; key: string; url: string; filename: string; contentType: string; mediaType: string; size: number; createdAt: string }>>
    >(`${ws()}/media`),

  delete: (key: string) =>
    request<void>(`${ws()}/media/${key}`, { method: "DELETE" }),
};

// ============================================================
// White-label
// ============================================================

export const whitelabelApi = {
  getConfig: () =>
    request<ApiResponse<WhitelabelConfig>>(`${ws()}/whitelabel`),

  updateConfig: (data: Partial<WhitelabelConfig>) =>
    request<ApiResponse<WhitelabelConfig>>(`${ws()}/whitelabel`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  listClients: (params?: { page?: number; pageSize?: number }) =>
    request<PaginatedResponse<Client>>(`${ws()}/clients${qs(params)}`),

  createClient: (data: { name: string; email: string; plan: string }) =>
    request<ApiResponse<Client>>(`${ws()}/clients`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  removeClient: (clientId: string) =>
    request<void>(`${ws()}/clients/${clientId}`, { method: "DELETE" }),
};

// ============================================================
// Repurpose
// ============================================================

export const repurposeApi = {
  /** Legacy — typed to old RepurposeRequest shape. Prefer repurposeContent(). */
  repurpose: (data: RepurposeRequest) =>
    request<ApiResponse<AIJob>>(`${ws()}/repurpose`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Calls POST /repurpose with the full backend schema and returns platform drafts. */
  repurposeContent: (data: {
    source_type: "url" | "youtube" | "tiktok" | "text";
    source_url?: string;
    source_text?: string;
    platforms: string[];
    tone?: string;
    include_hashtags?: boolean;
    include_cta?: boolean;
    include_emoji?: boolean;
  }) =>
    request<{
      source_summary: string;
      platforms: Record<
        string,
        { content: string; hashtags: string[]; char_count: number; media_prompt?: string }
      >;
    }>(`${ws()}/repurpose`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ============================================================
// Automations
// ============================================================

export interface AutomationsListResponse {
  data: Automation[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export const automationsApi = {
  list: (page = 1, limit = 20) =>
    request<AutomationsListResponse>(
      `${ws()}/automations?page=${page}&limit=${limit}`,
    ),

  create: (data: CreateAutomationRequest) =>
    request<{ data: Automation }>(`${ws()}/automations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    request<{ data: Automation }>(`${ws()}/automations/${id}`),

  update: (id: string, data: Partial<CreateAutomationRequest>) =>
    request<{ data: Automation }>(`${ws()}/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`${ws()}/automations/${id}`, { method: "DELETE" }),

  toggle: (id: string) =>
    request<{ data: Automation }>(`${ws()}/automations/${id}/toggle`, {
      method: "POST",
    }),
};

// ============================================================
// Brand Kits
// ============================================================

export const brandKitApi = {
  list: () => request<{ data: BrandKit[] }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/brand-kits`),
  create: (data: CreateBrandKitRequest) => request<{ data: BrandKit }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/brand-kits`, { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => request<{ data: BrandKit }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/brand-kits/${id}`),
  update: (id: string, data: Partial<CreateBrandKitRequest>) => request<{ data: BrandKit }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/brand-kits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/v1/workspaces/${getActiveWorkspaceId()}/brand-kits/${id}`, { method: 'DELETE' }),
  setDefault: (id: string) => request<{ data: BrandKit }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/brand-kits/${id}/set-default`, { method: 'POST' }),
};

// ============================================================
// Campaigns
// ============================================================

export const campaignsApi = {
  list: (status?: string) => {
    const qs2 = status ? `?status=${status}` : ''
    return request<{ data: Campaign[]; meta: { total: number } }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns${qs2}`)
  },
  create: (data: CreateCampaignRequest) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns`, { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}`),
  update: (id: string, data: Partial<CreateCampaignRequest>) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}`, { method: 'DELETE' }),
  generate: (id: string) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/generate`, { method: 'POST' }),
  pause: (id: string) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/resume`, { method: 'POST' }),
  listPosts: (id: string, status?: string) => {
    const qs2 = status ? `?status=${status}` : ''
    return request<{ data: CampaignPost[] }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/posts${qs2}`)
  },
  updatePost: (id: string, pid: string, data: { generated_caption?: string; generated_hashtags?: string[] }) =>
    request<{ data: CampaignPost }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/posts/${pid}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approvePost: (id: string, pid: string) => request<{ data: CampaignPost }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/posts/${pid}/approve`, { method: 'POST' }),
  rejectPost: (id: string, pid: string) => request<{ data: CampaignPost }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/posts/${pid}/reject`, { method: 'POST' }),
  approveAll: (id: string) => request<{ approved: number }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/approve-all`, { method: 'POST' }),
  clone: (id: string) => request<{ data: Campaign }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/clone`, { method: 'POST' }),
  regeneratePost: (id: string, pid: string) => request<{ data: CampaignPost }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/posts/${pid}/regenerate`, { method: 'POST' }),
  launch: (id: string) => request<{ data: Campaign; message: string; meta: { scheduled_posts: number } }>(`/api/v1/workspaces/${getActiveWorkspaceId()}/campaigns/${id}/launch`, { method: 'POST' }),
}

// ============================================================
// Admin (super-admin only)
// ============================================================

/**
 * Request helper for admin endpoints. Uses the separate admin token
 * (sf_admin_access_token) so admin auth is isolated from regular user auth.
 */
async function adminReq<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("sf_admin_access_token")
      : null;
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

export const adminApi = {
  getStats: () =>
    adminReq<{
      total_users: number;
      total_workspaces: number;
      active_subscriptions: number;
      total_social_accounts: number;
      total_posts: number;
      ai_jobs_today: number;
      ai_credits_today: number;
    }>("/api/v1/admin/stats"),

  listUsers: (params?: { page?: number; pageSize?: number; search?: string; plan?: string }) => {
    // Backend uses `limit` not `pageSize`
    const { pageSize, ...rest } = params ?? {};
    const p = pageSize ? { ...rest, limit: pageSize } : rest;
    return adminReq<{ users: User[]; total: number; page: number; limit: number }>(`/api/v1/admin/users${qs(p)}`);
  },

  getUser: (id: string) => adminReq<ApiResponse<User>>(`/api/v1/admin/users/${id}`),

  suspendUser: (id: string) =>
    adminReq<ApiResponse<User>>(`/api/v1/admin/users/${id}/suspend`, {
      method: "POST",
    }),

  listWorkspaces: (params?: { page?: number; pageSize?: number }) =>
    adminReq<PaginatedResponse<Workspace>>(`/api/v1/admin/workspaces${qs(params)}`),

  listAiJobs: (params?: { page?: number; pageSize?: number }) =>
    adminReq<PaginatedResponse<AIJob>>(`/api/v1/admin/ai-jobs${qs(params)}`),

  getAuditLogs: (params?: { page?: number; pageSize?: number }) =>
    adminReq<PaginatedResponse<Record<string, unknown>>>(
      `/api/v1/admin/audit-logs${qs(params)}`,
    ),

  getRevenue: () =>
    adminReq<ApiResponse<Record<string, unknown>>>("/api/v1/admin/revenue"),

  grantCredits: (data: { userId: string; amount: number; reason?: string }) =>
    adminReq<ApiResponse<Record<string, unknown>>>("/api/v1/admin/grant-credits", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  grantPlan: (data: { userId: string; planType: string; trialDays?: number; expiresAt?: string }) =>
    adminReq<ApiResponse<Record<string, unknown>>>("/api/v1/admin/grant-plan", {
      method: "POST",
      body: JSON.stringify({ user_id: data.userId, plan: data.planType, trial_days: data.trialDays ?? 0 }),
    }),

  // ── Cost Configuration ───────────────────────────────────────
  getAiJobCosts: () =>
    adminReq<ApiResponse<Array<{ job_type: string; credits: number; usd_cost: number; description: string }>>>(
      "/api/v1/admin/cost-config/ai-jobs",
    ),

  updateAiJobCost: (jobType: string, data: { credits: number; usd_cost: number }) =>
    adminReq<ApiResponse<unknown>>(
      `/api/v1/admin/cost-config/ai-jobs/${jobType}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),

  bulkUpdateAiJobCosts: (
    costs: Array<{ job_type: string; credits: number; usd_cost: number }>,
  ) =>
    adminReq<ApiResponse<unknown>>("/api/v1/admin/cost-config/ai-jobs", {
      method: "PUT",
      body: JSON.stringify(costs),
    }),

  getCreditPackages: () =>
    adminReq<ApiResponse<Array<{ id: string; label: string; credits: number; usd_price: number; ngn_price: number; best_value: boolean }>>>(
      "/api/v1/admin/cost-config/packages",
    ),

  updateCreditPackage: (
    id: string,
    data: { credits?: number; usd_price?: number; ngn_price?: number; best_value?: boolean },
  ) =>
    adminReq<ApiResponse<unknown>>(
      `/api/v1/admin/cost-config/packages/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),

  getPlatformSettings: async (): Promise<ApiResponse<Record<string, string>>> => {
    const res = await adminReq<ApiResponse<Array<{ key: string; value: string }>>>(
      "/api/v1/admin/cost-config/settings",
    );
    const record: Record<string, string> = {};
    for (const row of res.data ?? []) {
      record[row.key] = row.value;
    }
    return { success: true, data: record };
  },

  updatePlatformSetting: (key: string, value: string) =>
    adminReq<ApiResponse<unknown>>(`/api/v1/admin/cost-config/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),

  getIntegrationStatus: () =>
    adminReq<ApiResponse<Array<{ key: string; label: string; configured: boolean; masked: string; updated_at: string | null }>>>(
      "/api/v1/admin/cost-config/integrations",
    ),

  sendBroadcast: (data: { subject: string; body: string; target: string; msg_type: string }) =>
    adminReq<ApiResponse<{ message: string; recipients: number }>>("/api/v1/admin/broadcast", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listBroadcasts: () =>
    adminReq<ApiResponse<Array<Record<string, unknown>>>>("/api/v1/admin/broadcasts"),

  getPlatformStats: () =>
    adminReq<{
      platforms: Array<{ platform: string; count: number }>;
      total_accounts: number;
      failed_posts_today: number;
    }>("/api/v1/admin/platforms"),

  // ── Admin Campaigns ──────────────────────────────────────────────────────────
  listAllCampaigns: (params?: { status?: string; page?: number; search?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.page) q.set('page', String(params.page))
    if (params?.search) q.set('search', params.search)
    const qs2 = q.toString() ? `?${q.toString()}` : ''
    return adminReq<{ data: AdminCampaign[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
      `/api/v1/admin/campaigns${qs2}`
    )
  },

  forcePauseCampaign: (id: string) =>
    adminReq<void>(`/api/v1/admin/campaigns/${id}/force-pause`, { method: 'POST' }),

  adminGetCampaign: (id: string) =>
    adminReq<{ data: AdminCampaign }>(`/api/v1/admin/campaigns/${id}`),

  adminListCampaignPosts: (id: string) =>
    adminReq<{ data: CampaignPost[] }>(`/api/v1/admin/campaigns/${id}/posts`),
};
