package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
	"github.com/socialforge/backend/internal/services/notifications"
)

const (
	pendingInvitePrefix = "pinvite:"
	pendingInviteTTL    = 7 * 24 * time.Hour
)

// pendingInvitePayload is the JSON blob stored in Redis for invites to
// emails that do not yet have a user account.
type pendingInvitePayload struct {
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	InviterID   uuid.UUID `json:"inviter_id"`
}

func hashInviteToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func newInviteToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// MembersHandler handles workspace membership endpoints.
type MembersHandler struct {
	db            *gorm.DB
	rdb           *redis.Client
	workspaces    repository.WorkspaceRepository
	users         repository.UserRepository
	notifications *notifications.Service
	cfg           *config.Config
	log           *zap.Logger
}

// NewMembersHandler constructs a MembersHandler.
func NewMembersHandler(
	db *gorm.DB,
	rdb *redis.Client,
	workspaces repository.WorkspaceRepository,
	users repository.UserRepository,
	notif *notifications.Service,
	cfg *config.Config,
	log *zap.Logger,
) *MembersHandler {
	return &MembersHandler{
		db:            db,
		rdb:           rdb,
		workspaces:    workspaces,
		users:         users,
		notifications: notif,
		cfg:           cfg,
		log:           log.Named("members_handler"),
	}
}

// memberView is the serialised membership response.
type memberView struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	InvitedAt string    `json:"invited_at,omitempty"`
}

func (h *MembersHandler) toView(m *models.WorkspaceMember, u *models.User) memberView {
	v := memberView{
		ID:     m.ID,
		UserID: m.UserID,
		Role:   string(m.Role),
	}
	if !m.InvitedAt.IsZero() {
		v.InvitedAt = m.InvitedAt.Format("2006-01-02T15:04:05Z07:00")
	}
	if u != nil {
		v.Email = u.Email
		v.Name = u.Name
	}
	return v
}

// ListMembers returns all members of the workspace.
// GET /api/v1/workspaces/:workspaceId/members
func (h *MembersHandler) ListMembers(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	members, err := h.workspaces.ListMembers(c.Context(), wid)
	if err != nil {
		h.log.Error("ListMembers", zap.Error(err))
		return internalError(c, "failed to list members")
	}

	views := make([]memberView, 0, len(members))
	for _, m := range members {
		user, _ := h.users.GetByID(c.Context(), m.UserID)
		views = append(views, h.toView(m, user))
	}

	return c.JSON(fiber.Map{"data": views})
}

// InviteMember adds a user to the workspace by email.
// POST /api/v1/workspaces/:workspaceId/members/invite
func (h *MembersHandler) InviteMember(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	type inviteBody struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	var req inviteBody
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		return badRequest(c, "email is required", "VALIDATION_ERROR")
	}

	role := models.WorkspaceRole(req.Role)
	switch role {
	case models.WorkspaceRoleAdmin, models.WorkspaceRoleEditor, models.WorkspaceRoleViewer:
	case "":
		role = models.WorkspaceRoleEditor
	default:
		return badRequest(c, "invalid role", "VALIDATION_ERROR")
	}

	user, err := h.users.GetByEmail(c.Context(), email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Create a pending invitation token and email the prospective user a
			// signup link. The invite is redeemed after they register via
			// POST /auth/accept-invite.
			return h.createPendingInvite(c, wid, email, role)
		}
		h.log.Error("InviteMember: users.GetByEmail", zap.Error(err))
		return internalError(c, "failed to look up user")
	}

	member := &models.WorkspaceMember{
		WorkspaceID: wid,
		UserID:      user.ID,
		Role:        role,
	}
	if err := h.workspaces.AddMember(c.Context(), member); err != nil {
		h.log.Error("InviteMember: workspaces.AddMember", zap.Error(err))
		return internalError(c, "failed to add member")
	}

	writeAudit(c, h.db, h.log, wid, "member.invite", "workspace_member", member.ID.String(),
		map[string]any{"email": email, "role": string(role), "user_id": user.ID.String()})

	// Fire-and-forget invite email.
	if h.notifications != nil {
		inviterName := "A teammate"
		if inviter, ok := c.Locals(middleware.LocalsUser).(*models.User); ok && inviter != nil {
			inviterName = inviter.Name
		}
		inviteURL := ""
		if h.cfg != nil {
			inviteURL = h.cfg.App.FrontendURL + "/dashboard"
		}
		go func(email, name, url string) {
			if err := h.notifications.SendClientInvite(context.Background(), inviterName, email, name, url); err != nil {
				h.log.Warn("SendClientInvite failed", zap.Error(err), zap.String("to", email))
			}
		}(user.Email, user.Name, inviteURL)
	}

	return c.JSON(fiber.Map{"data": h.toView(member, user)})
}

// UpdateMemberRole changes a member's role.
// PATCH /api/v1/workspaces/:workspaceId/members/:memberId
func (h *MembersHandler) UpdateMemberRole(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}
	memberUserID, err := uuid.Parse(c.Params("memberId"))
	if err != nil {
		return badRequest(c, "memberId must be a valid UUID", "INVALID_ID")
	}

	type body struct {
		Role string `json:"role"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	role := models.WorkspaceRole(req.Role)
	switch role {
	case models.WorkspaceRoleAdmin, models.WorkspaceRoleEditor, models.WorkspaceRoleViewer:
	default:
		return badRequest(c, "invalid role", "VALIDATION_ERROR")
	}

	member, err := h.workspaces.GetMember(c.Context(), wid, memberUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return notFound(c, "member not found", "NOT_FOUND")
		}
		h.log.Error("UpdateMemberRole: GetMember", zap.Error(err))
		return internalError(c, "failed to fetch member")
	}

	member.Role = role
	if err := h.workspaces.UpdateMemberRole(c.Context(), wid, memberUserID, role); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return notFound(c, "member not found", "NOT_FOUND")
		}
		h.log.Error("UpdateMemberRole", zap.Error(err))
		return internalError(c, "failed to update role")
	}

	user, _ := h.users.GetByID(c.Context(), memberUserID)
	writeAudit(c, h.db, h.log, wid, "member.role_update", "workspace_member", memberUserID.String(),
		map[string]any{"role": string(role)})
	return c.JSON(fiber.Map{"data": h.toView(member, user)})
}

// RemoveMember removes a user from the workspace.
// DELETE /api/v1/workspaces/:workspaceId/members/:memberId
func (h *MembersHandler) RemoveMember(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}
	memberUserID, err := uuid.Parse(c.Params("memberId"))
	if err != nil {
		return badRequest(c, "memberId must be a valid UUID", "INVALID_ID")
	}

	if err := h.workspaces.RemoveMember(c.Context(), wid, memberUserID); err != nil {
		h.log.Error("RemoveMember", zap.Error(err))
		return internalError(c, "failed to remove member")
	}
	writeAudit(c, h.db, h.log, wid, "member.remove", "workspace_member", memberUserID.String(), nil)
	return c.JSON(fiber.Map{"data": fiber.Map{"message": "member removed"}})
}

// createPendingInvite stores a pending invitation in Redis and emails a
// signup link to the prospective user. The token is single-use and expires
// after pendingInviteTTL.
func (h *MembersHandler) createPendingInvite(c *fiber.Ctx, wid uuid.UUID, email string, role models.WorkspaceRole) error {
	var inviterID uuid.UUID
	inviterName := "A teammate"
	if inviter, ok := c.Locals(middleware.LocalsUser).(*models.User); ok && inviter != nil {
		inviterID = inviter.ID
		inviterName = inviter.Name
	}

	rawToken, err := newInviteToken()
	if err != nil {
		h.log.Error("createPendingInvite: token gen", zap.Error(err))
		return internalError(c, "failed to generate invite token")
	}

	payload := pendingInvitePayload{
		WorkspaceID: wid,
		Email:       email,
		Role:        string(role),
		InviterID:   inviterID,
	}
	blob, err := json.Marshal(payload)
	if err != nil {
		return internalError(c, "failed to encode invite")
	}

	key := pendingInvitePrefix + hashInviteToken(rawToken)
	if err := h.rdb.Set(c.Context(), key, blob, pendingInviteTTL).Err(); err != nil {
		h.log.Error("createPendingInvite: redis set", zap.Error(err))
		return internalError(c, "failed to store invite")
	}

	// Fire-and-forget email.
	if h.notifications != nil && h.cfg != nil {
		inviteURL := h.cfg.App.FrontendURL + "/signup?invite=" + rawToken
		go func(to, url string) {
			if err := h.notifications.SendClientInvite(context.Background(), inviterName, to, "", url); err != nil {
				h.log.Warn("SendClientInvite (pending) failed", zap.Error(err), zap.String("to", to))
			}
		}(email, inviteURL)
	}

	writeAudit(c, h.db, h.log, wid, "member.invite_pending", "pending_invite", "",
		map[string]any{"email": email, "role": string(role)})

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"data": fiber.Map{
			"status":  "pending",
			"email":   email,
			"message": "invitation email sent — user will join the workspace after signing up",
		},
	})
}

// AcceptInvite redeems a pending invitation token for the authenticated user.
// POST /api/v1/auth/accept-invite  { "token": "..." }
func (h *MembersHandler) AcceptInvite(c *fiber.Ctx) error {
	type body struct {
		Token string `json:"token"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		return badRequest(c, "token is required", "VALIDATION_ERROR")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "authentication required")
	}

	key := pendingInvitePrefix + hashInviteToken(req.Token)
	blob, err := h.rdb.Get(c.Context(), key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return badRequest(c, "invite token is invalid or has expired", "INVITE_INVALID")
		}
		h.log.Error("AcceptInvite: redis get", zap.Error(err))
		return internalError(c, "failed to look up invite")
	}

	var payload pendingInvitePayload
	if err := json.Unmarshal(blob, &payload); err != nil {
		return internalError(c, "corrupted invite")
	}

	// Email must match the authenticated user — prevents stolen-token takeover.
	if !strings.EqualFold(payload.Email, user.Email) {
		return forbidden(c, "invite was issued to a different email")
	}

	role := models.WorkspaceRole(payload.Role)
	switch role {
	case models.WorkspaceRoleAdmin, models.WorkspaceRoleEditor, models.WorkspaceRoleViewer:
	default:
		role = models.WorkspaceRoleEditor
	}

	member := &models.WorkspaceMember{
		WorkspaceID: payload.WorkspaceID,
		UserID:      user.ID,
		Role:        role,
	}
	if err := h.workspaces.AddMember(c.Context(), member); err != nil {
		h.log.Error("AcceptInvite: AddMember", zap.Error(err))
		return internalError(c, "failed to join workspace")
	}

	// Single-use: delete the token whether or not it was successfully redeemed
	// before this point.
	_ = h.rdb.Del(c.Context(), key).Err()

	writeAudit(c, h.db, h.log, payload.WorkspaceID, "member.invite_accepted", "workspace_member", member.ID.String(),
		map[string]any{"email": user.Email, "role": string(role)})

	return c.JSON(fiber.Map{"data": fiber.Map{
		"workspace_id": payload.WorkspaceID,
		"role":         string(role),
	}})
}
