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
  POST = "text",
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
  // AI credit tracking — present on backend responses
  ai_credits_limit?: number;
  ai_credits_used?: number;
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
  platforms: string[];
  postPlatforms?: PostPlatform[];
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
  error_message?: string;
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

// ============================================================
// Automations
// ============================================================

export type AutomationTriggerType = 'post_published' | 'post_failed' | 'schedule';
export type AutomationActionType = 'send_notification' | 'auto_repurpose' | 'republish_after_delay';

export interface Automation {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description?: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  is_enabled: boolean;
  last_triggered_at?: string;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAutomationRequest {
  name: string;
  description?: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
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

// ============================================================
// Brand Kit
// ============================================================

export interface BrandKit {
  id: string
  workspace_id: string
  created_by: string
  name: string
  is_default: boolean
  industry?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  logo_url?: string
  logo_dark_url?: string
  brand_voice?: string
  target_audience?: string
  content_pillars: string[]
  brand_hashtags: string[]
  dos: string[]
  donts: string[]
  example_posts: string[]
  cta_preferences: Record<string, string>
  /** Company website URL — triggers automatic AI brand context extraction on save */
  website_url?: string
  /** AI-extracted brand summary (mission, products, audience) injected into every AI prompt */
  brand_description?: string
  created_at: string
  updated_at: string
}

export interface CreateBrandKitRequest {
  name: string
  is_default?: boolean
  industry?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  logo_url?: string
  logo_dark_url?: string
  brand_voice?: string
  target_audience?: string
  content_pillars?: string[]
  brand_hashtags?: string[]
  dos?: string[]
  donts?: string[]
  example_posts?: string[]
  cta_preferences?: Record<string, string>
  website_url?: string
}

// ============================================================
// Campaigns
// ============================================================

export type CampaignStatus = 'draft' | 'generating' | 'review' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed'
export type CampaignGoal = 'awareness' | 'engagement' | 'sales' | 'education' | 'event_promotion'
export type CampaignPostStatus = 'pending_generation' | 'generating' | 'generated' | 'approved' | 'rejected' | 'scheduled' | 'published' | 'failed'

export interface Campaign {
  id: string
  workspace_id: string
  brand_kit_id?: string
  created_by: string
  name: string
  status: CampaignStatus
  goal?: CampaignGoal
  brief?: string
  start_date?: string
  end_date?: string
  platforms: string[]
  posting_frequency: Record<string, number>
  content_mix: Record<string, number>
  auto_approve: boolean
  credits_budget_cap: number
  credits_estimated: number
  credits_used: number
  generation_progress: Record<string, unknown>
  total_posts: number
  posts_generated: number
  posts_approved: number
  posts_published: number
  settings: Record<string, unknown>
  brand_kit?: BrandKit
  created_at: string
  updated_at: string
}

export interface CampaignPost {
  id: string
  campaign_id: string
  workspace_id: string
  post_id?: string
  scheduled_for: string
  platform: string
  post_type: string
  content_pillar?: string
  status: CampaignPostStatus
  generated_caption?: string
  generated_hashtags: string[]
  media_urls: string[]
  error_message?: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateCampaignRequest {
  name: string
  brand_kit_id?: string
  goal?: CampaignGoal
  brief?: string
  start_date?: string
  end_date?: string
  platforms?: string[]
  posting_frequency?: Record<string, number>
  content_mix?: Record<string, number>
  auto_approve?: boolean
  credits_budget_cap?: number
  settings?: Record<string, unknown>
}

// ============================================================
// In-App Notifications
// ============================================================

export interface InAppNotification {
  id: string
  workspace_id: string
  user_id: string
  title: string
  body: string
  action_url?: string
  is_read: boolean
  created_at: string
  updated_at: string
}

export interface NotificationsListResponse {
  data: InAppNotification[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
  unread_count: number
}

// ============================================================
// Templates
// ============================================================

export interface Template {
  id: string
  workspace_id: string
  created_by: string
  name: string
  platform: string
  type: string
  prompt: string
  example_output: string
  is_public: boolean
  used_count: number
  last_used_at?: string
  created_at: string
  updated_at: string
}

export interface CreateTemplateRequest {
  name: string
  platform?: string
  type?: string
  prompt?: string
  example_output?: string
  is_public?: boolean
}
