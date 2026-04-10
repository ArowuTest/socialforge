// Package models defines all GORM data models, enum types, and JSON column
// helpers used throughout SocialForge.
package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ─── Enum types ───────────────────────────────────────────────────────────────

// PlanType represents a subscription plan tier.
type PlanType string

const (
	PlanFree    PlanType = "free"
	PlanStarter PlanType = "starter"
	PlanPro     PlanType = "pro"
	PlanAgency  PlanType = "agency"
)

func (p PlanType) String() string { return string(p) }

// PlatformType represents a supported social media platform.
type PlatformType string

const (
	PlatformInstagram  PlatformType = "instagram"
	PlatformTikTok     PlatformType = "tiktok"
	PlatformYouTube    PlatformType = "youtube"
	PlatformLinkedIn   PlatformType = "linkedin"
	PlatformTwitter    PlatformType = "twitter"
	PlatformFacebook   PlatformType = "facebook"
	PlatformPinterest  PlatformType = "pinterest"
	PlatformThreads    PlatformType = "threads"
	PlatformBluesky    PlatformType = "bluesky"
)

func (p PlatformType) String() string { return string(p) }

// PostStatus represents the lifecycle state of a post.
type PostStatus string

const (
	PostStatusDraft      PostStatus = "draft"
	PostStatusScheduled  PostStatus = "scheduled"
	PostStatusPublishing PostStatus = "publishing"
	PostStatusPublished  PostStatus = "published"
	PostStatusFailed     PostStatus = "failed"
)

func (s PostStatus) String() string { return string(s) }

// AIJobType represents the kind of AI generation task.
type AIJobType string

const (
	AIJobGenerateText     AIJobType = "generate_text"
	AIJobGenerateImage    AIJobType = "generate_image"
	AIJobGenerateVideo    AIJobType = "generate_video"
	AIJobRepurposeContent AIJobType = "repurpose_content"
)

func (t AIJobType) String() string { return string(t) }

// WorkspaceRole represents a member's role within a workspace.
type WorkspaceRole string

const (
	WorkspaceRoleOwner  WorkspaceRole = "owner"
	WorkspaceRoleAdmin  WorkspaceRole = "admin"
	WorkspaceRoleEditor WorkspaceRole = "editor"
	WorkspaceRoleViewer WorkspaceRole = "viewer"
)

// SubscriptionStatus mirrors Stripe subscription statuses.
type SubscriptionStatus string

const (
	SubscriptionStatusActive            SubscriptionStatus = "active"
	SubscriptionStatusTrialing          SubscriptionStatus = "trialing"
	SubscriptionStatusPastDue           SubscriptionStatus = "past_due"
	SubscriptionStatusCanceled          SubscriptionStatus = "canceled"
	SubscriptionStatusIncomplete        SubscriptionStatus = "incomplete"
	SubscriptionStatusIncompleteExpired SubscriptionStatus = "incomplete_expired"
	SubscriptionStatusUnpaid            SubscriptionStatus = "unpaid"
	SubscriptionStatusPaused            SubscriptionStatus = "paused"
)

// PostType represents the content format of a post.
type PostType string

const (
	PostTypeText     PostType = "text"
	PostTypeImage    PostType = "image"
	PostTypeVideo    PostType = "video"
	PostTypeCarousel PostType = "carousel"
	PostTypeStory    PostType = "story"
	PostTypeReel     PostType = "reel"
	PostTypeShort    PostType = "short"
	PostTypeThread   PostType = "thread"
	PostTypePin      PostType = "pin"
)

// AIJobStatus tracks the execution state of an AI job.
type AIJobStatus string

const (
	AIJobStatusPending    AIJobStatus = "pending"
	AIJobStatusProcessing AIJobStatus = "processing"
	AIJobStatusCompleted  AIJobStatus = "completed"
	AIJobStatusFailed     AIJobStatus = "failed"
)

// LedgerEntryType classifies a credit ledger movement.
type LedgerEntryType string

const (
	LedgerMonthlyGrant LedgerEntryType = "monthly_grant"
	LedgerTopUp        LedgerEntryType = "top_up"
	LedgerAIDebit      LedgerEntryType = "ai_debit"
	LedgerRefund       LedgerEntryType = "refund"
	LedgerAdjustment   LedgerEntryType = "adjustment"
)

// TopUpStatus tracks the lifecycle of a credit top-up purchase.
type TopUpStatus string

const (
	TopUpPending   TopUpStatus = "pending"
	TopUpCompleted TopUpStatus = "completed"
	TopUpFailed    TopUpStatus = "failed"
	TopUpRefunded  TopUpStatus = "refunded"
)

// PaymentProvider identifies the payment gateway used for a top-up.
type PaymentProvider string

const (
	ProviderStripe   PaymentProvider = "stripe"
	ProviderPaystack PaymentProvider = "paystack"
)

// ─── JSON column helpers ──────────────────────────────────────────────────────

// StringSlice is a []string that serialises to/from a JSON array column.
type StringSlice []string

func (s StringSlice) Value() (driver.Value, error) {
	if s == nil {
		return "[]", nil
	}
	b, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (s *StringSlice) Scan(src interface{}) error {
	var data []byte
	switch v := src.(type) {
	case string:
		data = []byte(v)
	case []byte:
		data = v
	case nil:
		*s = StringSlice{}
		return nil
	default:
		return fmt.Errorf("StringSlice: unsupported source type %T", src)
	}
	return json.Unmarshal(data, s)
}

// JSONMap is a map[string]interface{} stored as a JSONB column.
type JSONMap map[string]interface{}

func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return "{}", nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (m *JSONMap) Scan(src interface{}) error {
	var data []byte
	switch v := src.(type) {
	case string:
		data = []byte(v)
	case []byte:
		data = v
	case nil:
		*m = JSONMap{}
		return nil
	default:
		return fmt.Errorf("JSONMap: unsupported source type %T", src)
	}
	return json.Unmarshal(data, m)
}

// PlanLimits defines the feature caps for a given plan tier.
type PlanLimits struct {
	MaxWorkspaces     int  `json:"max_workspaces"`
	MaxSocialAccounts int  `json:"max_social_accounts"`
	MaxScheduledPosts int  `json:"max_scheduled_posts"`
	AICreditsPerMonth int  `json:"ai_credits_per_month"`
	MaxTeamMembers    int  `json:"max_team_members"`
	CanWhiteLabel     bool `json:"can_white_label"`
}

func (p PlanLimits) Value() (driver.Value, error) {
	b, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (p *PlanLimits) Scan(src interface{}) error {
	var data []byte
	switch v := src.(type) {
	case string:
		data = []byte(v)
	case []byte:
		data = v
	default:
		return fmt.Errorf("PlanLimits: unsupported source type %T", src)
	}
	return json.Unmarshal(data, p)
}

// ─── Base model ───────────────────────────────────────────────────────────────

// Base embeds a UUID primary key with GORM auto-generate hooks.
type Base struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time      `gorm:"autoCreateTime"                                  json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime"                                  json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index"                                           json:"-"`
}

// BeforeCreate ensures the UUID is populated when the database default is unavailable.
func (b *Base) BeforeCreate(_ *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

// ─── User ─────────────────────────────────────────────────────────────────────

// User represents an authenticated person using the platform.
type User struct {
	Base
	Email                string             `gorm:"uniqueIndex;not null;size:320"           json:"email"`
	PasswordHash         string             `gorm:"not null"                                json:"-"`
	Name                 string             `gorm:"not null;size:255"                       json:"name"`
	AvatarURL            string             `gorm:"size:2048"                               json:"avatar_url,omitempty"`
	Plan                 PlanType           `gorm:"not null;default:'free';size:20"         json:"plan"`
	StripeCustomerID     string             `gorm:"index;size:255"                          json:"stripe_customer_id,omitempty"`
	StripeSubscriptionID string             `gorm:"index;size:255"                          json:"stripe_subscription_id,omitempty"`
	SubscriptionStatus   SubscriptionStatus `gorm:"size:50"                                 json:"subscription_status,omitempty"`
	TrialEndsAt          *time.Time         `                                               json:"trial_ends_at,omitempty"`
	APIKey               string             `gorm:"index;size:128"                          json:"-"`
	EmailVerifiedAt      *time.Time         `                                               json:"email_verified_at,omitempty"`
	LastLoginAt          *time.Time         `                                               json:"last_login_at,omitempty"`
	IsSuperAdmin         bool               `gorm:"not null;default:false"                  json:"is_super_admin"`
	IsSuspended          bool               `gorm:"not null;default:false"                  json:"is_suspended"`

	// Associations (not loaded by default)
	Workspaces []Workspace       `gorm:"foreignKey:OwnerID" json:"-"`
	Members    []WorkspaceMember `gorm:"foreignKey:UserID"  json:"-"`
	APIKeys    []ApiKey          `gorm:"foreignKey:UserID"  json:"-"`
}

func (User) TableName() string { return "users" }

// ─── Workspace ────────────────────────────────────────────────────────────────

// Workspace is a tenant / organisation that groups social accounts and content.
type Workspace struct {
	Base
	Name          string    `gorm:"not null;size:255"                   json:"name"`
	Slug          string    `gorm:"uniqueIndex;not null;size:100"       json:"slug"`
	OwnerID       uuid.UUID `gorm:"type:uuid;not null;index"            json:"owner_id"`
	LogoURL       string    `gorm:"size:2048"                           json:"logo_url,omitempty"`
	PrimaryColor  string    `gorm:"size:7"                              json:"primary_color,omitempty"` // hex e.g. #3B82F6
	CustomDomain  string    `gorm:"uniqueIndex;size:253"               json:"custom_domain,omitempty"`
	IsWhitelabel  bool      `gorm:"not null;default:false"             json:"is_whitelabel"`
	Plan          PlanType  `gorm:"not null;default:'free';size:20"    json:"plan"`
	// Billing
	StripeCustomerID     string             `gorm:"size:255"                        json:"stripe_customer_id,omitempty"`
	StripeSubscriptionID string             `gorm:"size:255"                        json:"stripe_subscription_id,omitempty"`
	SubscriptionStatus   SubscriptionStatus `gorm:"size:50"                         json:"subscription_status,omitempty"`
	CurrentPeriodStart   *time.Time         `                                       json:"current_period_start,omitempty"`
	CurrentPeriodEnd     *time.Time         `                                       json:"current_period_end,omitempty"`
	// AI credits
	AICreditsUsed    int        `gorm:"not null;default:0"   json:"ai_credits_used"`
	AICreditsLimit   int        `gorm:"not null;default:100" json:"ai_credits_limit"`
	AICreditsResetAt *time.Time `                            json:"ai_credits_reset_at,omitempty"`
	// Purchased credits (top-up balance, separate from plan allowance)
	CreditBalance      int    `gorm:"not null;default:0" json:"credit_balance"`
	PaystackCustomerID string `gorm:"size:255"           json:"paystack_customer_id,omitempty"`
	// Branding overrides for white-label
	BrandName      string `gorm:"size:255"  json:"brand_name,omitempty"`
	SecondaryColor string `gorm:"size:7"    json:"secondary_color,omitempty"`
	// Client hierarchy
	ParentWorkspaceID *uuid.UUID `gorm:"type:uuid;index" json:"parent_workspace_id,omitempty"`

	// Associations
	Owner          User               `gorm:"foreignKey:OwnerID"      json:"-"`
	Members        []WorkspaceMember  `gorm:"foreignKey:WorkspaceID"  json:"-"`
	SocialAccounts []SocialAccount    `gorm:"foreignKey:WorkspaceID"  json:"-"`
	Posts          []Post             `gorm:"foreignKey:WorkspaceID"  json:"-"`
	ScheduleSlots  []ScheduleSlot     `gorm:"foreignKey:WorkspaceID"  json:"-"`
}

func (Workspace) TableName() string { return "workspaces" }

// ─── WorkspaceMember ─────────────────────────────────────────────────────────

// WorkspaceMember maps a User to a Workspace with a role.
type WorkspaceMember struct {
	Base
	WorkspaceID uuid.UUID     `gorm:"type:uuid;not null;uniqueIndex:idx_workspace_user" json:"workspace_id"`
	UserID      uuid.UUID     `gorm:"type:uuid;not null;uniqueIndex:idx_workspace_user" json:"user_id"`
	Role        WorkspaceRole `gorm:"not null;size:20;default:'editor'"                 json:"role"`
	InvitedAt   time.Time     `gorm:"autoCreateTime"                                    json:"invited_at"`
	AcceptedAt  *time.Time    `                                                         json:"accepted_at,omitempty"`

	// Associations
	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
	User      User      `gorm:"foreignKey:UserID"      json:"-"`
}

func (WorkspaceMember) TableName() string { return "workspace_members" }

// ─── SocialAccount ────────────────────────────────────────────────────────────

// SocialAccount represents a connected social media account within a workspace.
// Access and refresh tokens are stored AES-256-GCM encrypted at the application layer.
type SocialAccount struct {
	Base
	WorkspaceID   uuid.UUID    `gorm:"type:uuid;not null;index"      json:"workspace_id"`
	Platform      PlatformType `gorm:"not null;size:30;index"        json:"platform"`
	AccountID     string       `gorm:"not null;size:255"             json:"account_id"`
	AccountName   string       `gorm:"size:255"                      json:"account_name"`
	AccountHandle string       `gorm:"size:255"                      json:"account_handle"`
	AccountType   string       `gorm:"size:50"                       json:"account_type"` // personal | business | page
	AvatarURL     string       `gorm:"size:2048"                     json:"avatar_url,omitempty"`
	AccessToken   string       `gorm:"not null;type:text"            json:"-"` // encrypted
	RefreshToken  string       `gorm:"type:text"                     json:"-"` // encrypted
	TokenExpiresAt *time.Time  `                                     json:"token_expires_at,omitempty"`
	Scopes        StringSlice  `gorm:"type:text"                     json:"scopes,omitempty"`
	IsActive      bool         `gorm:"not null;default:true"         json:"is_active"`
	PageID        string       `gorm:"size:255"                      json:"page_id,omitempty"`   // Facebook / IG business page
	PageName      string       `gorm:"size:255"                      json:"page_name,omitempty"`
	FollowerCount int64        `gorm:"default:0"                     json:"follower_count"`
	ProfileURL    string       `gorm:"size:2048"                     json:"profile_url,omitempty"`
	Metadata      JSONMap      `gorm:"type:text"                     json:"metadata,omitempty"`

	// Associations
	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
}

func (SocialAccount) TableName() string { return "social_accounts" }

// ─── Post ─────────────────────────────────────────────────────────────────────

// Post represents a piece of content that can be scheduled or published across
// multiple social platforms simultaneously.
type Post struct {
	Base
	WorkspaceID     uuid.UUID   `gorm:"type:uuid;not null;index"              json:"workspace_id"`
	AuthorID        uuid.UUID   `gorm:"type:uuid;not null;index"              json:"author_id"`
	Title           string      `gorm:"size:500"                              json:"title,omitempty"`
	Content         string      `gorm:"type:text"                             json:"content"`
	Type            PostType    `gorm:"size:30;default:'text'"                json:"type"`
	Status          PostStatus  `gorm:"not null;default:'draft';size:20;index" json:"status"`
	ScheduledAt     *time.Time  `gorm:"index"                                 json:"scheduled_at,omitempty"`
	PublishedAt     *time.Time  `                                             json:"published_at,omitempty"`
	Platforms       StringSlice `gorm:"type:text"                             json:"platforms"`
	MediaURLs       StringSlice `gorm:"type:text"                             json:"media_urls,omitempty"`
	ThumbnailURL    string      `gorm:"size:2048"                             json:"thumbnail_url,omitempty"`
	PlatformPostIDs JSONMap     `gorm:"type:text"                             json:"platform_post_ids,omitempty"`
	ErrorMessage    string      `gorm:"type:text"                             json:"error_message,omitempty"`
	AIGenerated     bool        `gorm:"not null;default:false"                json:"ai_generated"`
	AIJobID         *uuid.UUID  `gorm:"type:uuid"                             json:"ai_job_id,omitempty"`
	Hashtags        StringSlice `gorm:"type:text"                             json:"hashtags,omitempty"`
	FirstComment    string      `gorm:"type:text"                             json:"first_comment,omitempty"`
	// YouTube / video extras
	Description string `gorm:"type:text"  json:"description,omitempty"`
	Tags        string `gorm:"type:text"  json:"tags,omitempty"` // JSON array
	Privacy     string `gorm:"size:20"    json:"privacy,omitempty"` // public | private | unlisted
	// Pinterest extras
	BoardID string `gorm:"size:255"   json:"board_id,omitempty"`
	LinkURL string `gorm:"size:2048"  json:"link_url,omitempty"`
	// Retry / publish attempts
	RetryCount int `gorm:"default:0" json:"retry_count"`
	Attempts   int `gorm:"default:0" json:"attempts"`

	// Associations
	Workspace     Workspace      `gorm:"foreignKey:WorkspaceID" json:"-"`
	Author        User           `gorm:"foreignKey:AuthorID"    json:"-"`
	PostPlatforms []PostPlatform `gorm:"foreignKey:PostID"      json:"post_platforms,omitempty"`
}

func (Post) TableName() string { return "posts" }

// ─── PostPlatform ─────────────────────────────────────────────────────────────

// PostPlatform tracks the per-platform publishing status and result of a Post.
type PostPlatform struct {
	ID              uuid.UUID    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	PostID          uuid.UUID    `gorm:"type:uuid;not null;index"                       json:"post_id"`
	Platform        PlatformType `gorm:"not null;size:30"                               json:"platform"`
	SocialAccountID uuid.UUID    `gorm:"type:uuid;not null;index"                       json:"social_account_id"`
	Status          PostStatus   `gorm:"not null;size:20;default:'scheduled'"           json:"status"`
	PlatformPostID  string       `gorm:"size:255"                                       json:"platform_post_id,omitempty"`
	PostURL         string       `gorm:"size:2048"                                      json:"post_url,omitempty"`
	ErrorMessage    string       `gorm:"type:text"                                      json:"error_message,omitempty"`
	Attempts        int          `gorm:"default:0"                                      json:"attempts"`
	PublishedAt     *time.Time   `                                                      json:"published_at,omitempty"`
	CreatedAt       time.Time    `gorm:"autoCreateTime"                                 json:"created_at"`
	UpdatedAt       time.Time    `gorm:"autoUpdateTime"                                 json:"updated_at"`

	// Associations
	Post          Post          `gorm:"foreignKey:PostID"          json:"-"`
	SocialAccount SocialAccount `gorm:"foreignKey:SocialAccountID" json:"-"`
}

func (PostPlatform) TableName() string { return "post_platforms" }

// BeforeCreate sets the UUID when gen_random_uuid() is unavailable.
func (p *PostPlatform) BeforeCreate(_ *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}

// ─── ScheduleSlot ─────────────────────────────────────────────────────────────

// ScheduleSlot defines a recurring time slot for auto-scheduling posts.
type ScheduleSlot struct {
	Base
	WorkspaceID uuid.UUID    `gorm:"type:uuid;not null;index"       json:"workspace_id"`
	Platform    PlatformType `gorm:"not null;size:30"               json:"platform"`
	DayOfWeek   int          `gorm:"not null"                       json:"day_of_week"` // 0=Sun … 6=Sat
	TimeOfDay   string       `gorm:"not null;size:8"                json:"time_of_day"` // "HH:MM"
	Timezone    string       `gorm:"not null;size:64;default:'UTC'" json:"timezone"`
	IsActive    bool         `gorm:"not null;default:true"          json:"is_active"`

	// Associations
	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
}

func (ScheduleSlot) TableName() string { return "schedule_slots" }

// ─── ContentTemplate ──────────────────────────────────────────────────────────

// ContentTemplate is a reusable AI prompt template for content generation.
type ContentTemplate struct {
	Base
	WorkspaceID    *uuid.UUID   `gorm:"type:uuid;index"        json:"workspace_id,omitempty"` // nil = global template
	Name           string       `gorm:"not null;size:255"      json:"name"`
	Platform       PlatformType `gorm:"size:30"                json:"platform,omitempty"`
	TemplateType   string       `gorm:"not null;size:50"       json:"template_type"` // caption | thread | story | reel
	PromptTemplate string       `gorm:"type:text;not null"     json:"prompt_template"`
	ExampleOutput  string       `gorm:"type:text"              json:"example_output,omitempty"`
	IsPublic       bool         `gorm:"not null;default:false" json:"is_public"`
	UsageCount     int64        `gorm:"not null;default:0"     json:"usage_count"`

	// Associations
	Workspace *Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
}

func (ContentTemplate) TableName() string { return "content_templates" }

// ─── AIJob ────────────────────────────────────────────────────────────────────

// AIJob tracks a single AI generation task (text, image, video, repurpose).
type AIJob struct {
	Base
	WorkspaceID   uuid.UUID   `gorm:"type:uuid;not null;index"                json:"workspace_id"`
	JobType       AIJobType   `gorm:"not null;size:40;index"                  json:"job_type"`
	InputData     JSONMap     `gorm:"type:text"                               json:"input_data"`
	OutputData    JSONMap     `gorm:"type:text"                               json:"output_data,omitempty"`
	Status        AIJobStatus `gorm:"not null;size:20;default:'pending';index" json:"status"`
	ModelUsed     string      `gorm:"size:100"                                json:"model_used,omitempty"`
	CreditsUsed   int         `gorm:"not null;default:0"                      json:"credits_used"`
	USDCost       float64     `gorm:"type:numeric(10,6);not null;default:0"   json:"usd_cost"`
	ErrorMessage  string      `gorm:"type:text"                               json:"error_message,omitempty"`
	RequestedByID uuid.UUID   `gorm:"type:uuid;index"                         json:"requested_by_id"`
	StartedAt     *time.Time  `                                               json:"started_at,omitempty"`
	CompletedAt   *time.Time  `                                               json:"completed_at,omitempty"`

	// Associations
	Workspace Workspace `gorm:"foreignKey:WorkspaceID"  json:"-"`
	User      User      `gorm:"foreignKey:RequestedByID" json:"-"`
}

func (AIJob) TableName() string { return "ai_jobs" }

// ─── MediaItem ────────────────────────────────────────────────────────────────

// MediaItem tracks an uploaded media file stored in object storage.
type MediaItem struct {
	Base
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index"       json:"workspace_id"`
	UploadedByID uuid.UUID `gorm:"type:uuid;not null;index"       json:"uploaded_by_id"`
	Filename    string     `gorm:"not null;size:512"              json:"filename"`
	ContentType string     `gorm:"not null;size:100"              json:"content_type"`
	SizeBytes   int64      `gorm:"not null;default:0"             json:"size_bytes"`
	StorageKey  string     `gorm:"not null;type:text;uniqueIndex" json:"storage_key"`
	PublicURL   string     `gorm:"type:text"                      json:"public_url"`
	MediaType   string     `gorm:"not null;size:10;default:'image'" json:"media_type"` // image | video

	// Associations
	Workspace  Workspace `gorm:"foreignKey:WorkspaceID"   json:"-"`
	UploadedBy User      `gorm:"foreignKey:UploadedByID"  json:"-"`
}

func (MediaItem) TableName() string { return "media_items" }

// ─── ApiKey ───────────────────────────────────────────────────────────────────

// ApiKey stores a hashed API key for programmatic / webhook access.
// The raw key is only shown once at creation time and is never stored.
type ApiKey struct {
	Base
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	Name        string     `gorm:"not null;size:255"        json:"name"`
	KeyHash     string     `gorm:"not null;uniqueIndex"     json:"-"`
	KeyPrefix   string     `gorm:"not null;size:16"         json:"key_prefix"` // first chars shown in UI
	LastUsedAt  *time.Time `                                json:"last_used_at,omitempty"`
	ExpiresAt   *time.Time `                                json:"expires_at,omitempty"`
	IsActive    bool       `gorm:"not null;default:true"    json:"is_active"`
	Permissions StringSlice `gorm:"type:text"               json:"permissions,omitempty"`

	// Associations
	Workspace Workspace `gorm:"foreignKey:WorkspaceID" json:"-"`
	User      User      `gorm:"foreignKey:UserID"      json:"-"`
}

func (ApiKey) TableName() string { return "api_keys" }

// ─── AuditLog ─────────────────────────────────────────────────────────────────

// AuditLog records security-relevant actions for compliance and debugging.
// It is append-only; records are never updated or soft-deleted.
type AuditLog struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID  `gorm:"type:uuid;index"                               json:"workspace_id,omitempty"`
	UserID       uuid.UUID  `gorm:"type:uuid;index"                               json:"user_id,omitempty"`
	Action       string     `gorm:"not null;size:100;index"                       json:"action"`
	ResourceType string     `gorm:"size:100;index"                                json:"resource_type,omitempty"`
	ResourceID   string     `gorm:"size:255"                                      json:"resource_id,omitempty"`
	Metadata     JSONMap    `gorm:"type:text"                                     json:"metadata,omitempty"`
	IPAddress    string     `gorm:"size:45"                                       json:"ip_address,omitempty"`
	UserAgent    string     `gorm:"size:512"                                      json:"user_agent,omitempty"`
	CreatedAt    time.Time  `gorm:"autoCreateTime;index"                          json:"created_at"`
}

func (AuditLog) TableName() string { return "audit_logs" }

// BeforeCreate sets the UUID when the DB default is not available.
func (a *AuditLog) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// ─── PostRequest / PostResult (in-memory, not persisted) ─────────────────────

// PostRequest is the in-memory representation passed to platform publisher methods.
type PostRequest struct {
	Type         PostType
	Caption      string
	Hashtags     []string
	MediaURLs    []string
	ThumbnailURL string
	// Carousel
	CarouselItems []CarouselItem
	// Pinterest
	BoardID string
	LinkURL string
	Title   string
	// YouTube / video
	Description string
	Tags        []string
	Privacy     string // "public" | "private" | "unlisted"
	// Twitter / X
	ReplyToTweetID string
	ThreadTweets   []string
	// Story
	IsStory bool
}

// CarouselItem represents a single item in a carousel post.
type CarouselItem struct {
	MediaURL  string
	Caption   string
	MediaType string // "IMAGE" | "VIDEO"
}

// PostResult is returned by each platform's Post() method.
type PostResult struct {
	PlatformPostID string
	PostURL        string
}

// ─── Plan definition (non-DB helper) ─────────────────────────────────────────

// Plan is a non-persisted representation of a billing plan with feature metadata.
type Plan struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Description    string     `json:"description"`
	MonthlyPriceID string     `json:"monthly_price_id"`
	YearlyPriceID  string     `json:"yearly_price_id"`
	MonthlyPrice   float64    `json:"monthly_price"`
	YearlyPrice    float64    `json:"yearly_price"`
	Limits         PlanLimits `json:"limits"`
	Features       []string   `json:"features"`
}

// ─── CreditLedger ─────────────────────────────────────────────────────────────

// CreditLedger records every credit movement (debits and credits) for a workspace.
type CreditLedger struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID       `gorm:"type:uuid;not null;index"                       json:"workspace_id"`
	UserID       *uuid.UUID      `gorm:"type:uuid"                                      json:"user_id,omitempty"`
	EntryType    LedgerEntryType `gorm:"not null;size:30"                               json:"entry_type"`
	Credits      int             `gorm:"not null"                                       json:"credits"`
	BalanceAfter int             `gorm:"not null"                                       json:"balance_after"`
	USDAmount    *float64        `gorm:"type:numeric(10,4)"                             json:"usd_amount,omitempty"`
	Currency     string          `gorm:"size:3;default:'USD'"                           json:"currency"`
	ExchangeRate *float64        `gorm:"type:numeric(12,6)"                             json:"exchange_rate,omitempty"`
	Provider     string          `gorm:"size:20"                                        json:"provider,omitempty"`
	ProviderRef  string          `gorm:"size:255;index"                                 json:"provider_ref,omitempty"`
	AIJobID      *uuid.UUID      `gorm:"type:uuid"                                      json:"ai_job_id,omitempty"`
	Metadata     JSONMap         `gorm:"type:text"                                      json:"metadata,omitempty"`
	CreatedAt    time.Time       `gorm:"autoCreateTime"                                 json:"created_at"`
}

func (CreditLedger) TableName() string { return "credit_ledger" }

// BeforeCreate sets the UUID when the database default is unavailable.
func (c *CreditLedger) BeforeCreate(_ *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

// ─── CreditTopUp ──────────────────────────────────────────────────────────────

// CreditTopUp records a purchased credit top-up transaction.
type CreditTopUp struct {
	Base
	WorkspaceID      uuid.UUID       `gorm:"type:uuid;not null;index"           json:"workspace_id"`
	UserID           uuid.UUID       `gorm:"type:uuid;not null;index"           json:"user_id"`
	Credits          int             `gorm:"not null"                           json:"credits"`
	USDAmount        float64         `gorm:"type:numeric(10,4);not null"        json:"usd_amount"`
	Currency         string          `gorm:"size:3;not null;default:'USD'"      json:"currency"`
	AmountInCurrency float64         `gorm:"type:numeric(12,2);not null"        json:"amount_in_currency"`
	ExchangeRate     *float64        `gorm:"type:numeric(12,6)"                 json:"exchange_rate,omitempty"`
	Provider         PaymentProvider `gorm:"not null;size:20"                   json:"provider"`
	ProviderRef      string          `gorm:"uniqueIndex;size:255"               json:"provider_ref,omitempty"`
	Status           TopUpStatus     `gorm:"not null;size:20;default:'pending'" json:"status"`
	Metadata         JSONMap         `gorm:"type:text"                          json:"metadata,omitempty"`
	Workspace        Workspace       `gorm:"foreignKey:WorkspaceID"             json:"-"`
	User             User            `gorm:"foreignKey:UserID"                  json:"-"`
}

func (CreditTopUp) TableName() string { return "credit_topups" }

// ─── StripeWebhookEvent ──────────────────────────────────────────────────────

// StripeWebhookEvent tracks processed Stripe webhook events for idempotency.
// Before processing a webhook, the service checks whether the event ID has
// already been recorded and marked as processed; if so, the event is skipped.
type StripeWebhookEvent struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	StripeEventID string    `gorm:"uniqueIndex;size:255;not null"                  json:"stripe_event_id"`
	EventType     string    `gorm:"size:100;not null"                              json:"event_type"`
	Payload       string    `gorm:"type:text"                                      json:"payload,omitempty"`
	Processed     bool      `gorm:"not null;default:false"                         json:"processed"`
	CreatedAt     time.Time `gorm:"autoCreateTime"                                 json:"created_at"`
}

func (StripeWebhookEvent) TableName() string { return "stripe_webhook_events" }

// BeforeCreate sets the UUID when the database default is unavailable.
func (s *StripeWebhookEvent) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}
