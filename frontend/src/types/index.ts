// ============================================================
// Enums
// ============================================================

export enum Platform {
  INSTAGRAM = "instagram",
  TIKTOK = "tiktok",
  YOUTUBE = "youtube",
  LINKEDIN = "linkedin",
  TWITTER = "twitter",
  FACEBOOK = "facebook",
  PINTEREST = "pinterest",
  THREADS = "threads",
  BLUESKY = "bluesky",
}

export enum PostStatus {
  DRAFT = "draft",
  SCHEDULED = "scheduled",
  PUBLISHED = "published",
  FAILED = "failed",
  PROCESSING = "processing",
}

export enum PostType {
  POST = "post",
  REEL = "reel",
  STORY = "story",
  CAROUSEL = "carousel",
  THREAD = "thread",
  VIDEO = "video",
  SHORT = "short",
}

export enum AIJobStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum PlanType {
  FREE = "free",
  STARTER = "starter",
  PRO = "pro",
  AGENCY = "agency",
  ENTERPRISE = "enterprise",
}

export enum AccountStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  ERROR = "error",
  DISCONNECTED = "disconnected",
}

// ============================================================
// Core Models
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  currentWorkspaceId: string;
  is_super_admin?: boolean;
  is_suspended?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  timezone: string;
  plan: PlanType;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  isAgency: boolean;
  whitelabelEnabled: boolean;
}

export interface SocialAccount {
  id: string;
  workspace_id: string;
  platform: Platform;
  /** Legacy camelCase aliases (may be undefined for backend responses) */
  workspaceId?: string;
  platformAccountId?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
  followerCount?: number;
  status?: AccountStatus;
  connectedAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  /** Actual backend snake_case fields */
  account_id?: string;
  account_name?: string;
  account_handle?: string;
  account_type?: string;
  is_active?: boolean;
  follower_count?: number;
  created_at?: string;
  updated_at?: string;
  token_expired?: boolean;
  token_expiring_soon?: boolean;
}

export interface PostMedia {
  id: string;
  url: string;
  type: "image" | "video";
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export interface PostPlatform {
  id: string;
  postId: string;
  platform: Platform;
  platformPostId?: string;
  status: PostStatus;
  caption?: string;
  publishedAt?: string;
  error?: string;
  metrics?: {
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
  };
}

export interface Post {
  id: string;
  workspaceId: string;
  caption: string;
  media: PostMedia[];
  platforms: PostPlatform[];
  status: PostStatus;
  postType: PostType;
  scheduledAt?: string;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  aiGenerated?: boolean;
  originalPostId?: string;
}

export interface ScheduleSlot {
  id: string;
  workspaceId: string;
  platform?: Platform;
  dayOfWeek: number;
  time: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

export interface CalendarEntry {
  date: string;
  posts: Post[];
}

// ============================================================
// AI Models
// ============================================================

export interface AIJob {
  id: string;
  workspaceId: string;
  type: "caption" | "image" | "video" | "repurpose";
  status: AIJobStatus;
  prompt?: string;
  /** Legacy frontend-only shape (not returned by backend) */
  result?: {
    caption?: string;
    imageUrl?: string;
    videoUrl?: string;
    repurposed?: Record<Platform, string>;
  };
  /** Actual backend field: matches output_data JSON column */
  output_data?: {
    caption?: string;
    url?: string;           // image/video URL
    width?: number;
    height?: number;
    hashtags?: string[];
    repurposed?: Record<string, string>;
  };
  error?: string;
  creditsUsed: number;
  createdAt: string;
  completedAt?: string;
}

export interface GenerateCaptionRequest {
  platform: Platform;
  topic: string;
  tone: "professional" | "casual" | "funny" | "inspirational";
  targetAudience?: string;
  keywords?: string[];
}

export interface GenerateImageRequest {
  prompt: string;
  style: "photorealistic" | "cartoon" | "minimalist" | "3d";
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1";
}

export interface RepurposeRequest {
  content: string;
  sourcePlatform?: Platform;
  targetPlatforms: Platform[];
}

// ============================================================
// Billing Models
// ============================================================

export interface PlanFeature {
  name: string;
  included: boolean;
  limit?: number;
}

export interface Plan {
  id: string;
  type: PlanType;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PlanFeature[];
  limits: {
    socialAccounts: number;
    scheduledPosts: number;
    aiCredits: number;
    teamMembers: number;
    clients?: number;
    workspaces?: number;
  };
  isPopular?: boolean;
}

export interface BillingUsage {
  workspaceId: string;
  period: string;
  socialAccountsUsed: number;
  socialAccountsLimit: number;
  scheduledPostsUsed: number;
  scheduledPostsLimit: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  teamMembersUsed: number;
  teamMembersLimit: number;
  clientsUsed?: number;
  clientsLimit?: number;
}

export interface Subscription {
  id: string;
  workspaceId: string;
  planType: PlanType;
  status: "active" | "canceled" | "past_due" | "trialing";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
}

// ============================================================
// White-label / Agency Models
// ============================================================

export interface WhitelabelConfig {
  id: string;
  workspaceId: string;
  enabled: boolean;
  brandName: string;
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  customDomain?: string;
  customDomainVerified: boolean;
  hideAnthropicBranding: boolean;
  supportEmail?: string;
  supportUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  agencyWorkspaceId: string;
  clientWorkspaceId: string;
  clientWorkspace: Workspace;
  plan: PlanType;
  status: "active" | "suspended" | "pending";
  socialAccountsCount: number;
  postsThisMonth: number;
  lastActiveAt?: string;
  createdAt: string;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  keyPreview: string;
  lastUsedAt?: string;
  createdAt: string;
  permissions: string[];
}

// ============================================================
// Credits & Top-up Models
// ============================================================

export type Currency = "USD" | "NGN";

export interface CreditPackage {
  id: string;
  credits: number;
  price_usd: number;
  display_price: string;
  currency: Currency;
  best_value?: boolean;
}

export interface CreditBalance {
  credit_balance: number;
  plan_credits_used: number;
  plan_credits_limit: number;
  monthly_usd_cost: number;
}

export interface CreditLedgerEntry {
  id: string;
  entry_type: "monthly_grant" | "top_up" | "ai_debit" | "refund" | "adjustment";
  credits: number;
  balance_after: number;
  usd_amount?: number;
  currency: string;
  provider?: string;
  provider_ref?: string;
  ai_job_id?: string;
  created_at: string;
}

export interface CreditTopUpSession {
  provider: "stripe" | "paystack";
  checkout_url: string;
  reference?: string;
}

// ============================================================
// UI Helper Types
// ============================================================

export type ViewMode = "month" | "week" | "list";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

export interface FilterOption {
  label: string;
  value: string;
}
