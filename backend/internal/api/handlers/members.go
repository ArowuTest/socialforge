package handlers

import (
	"context"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
	"github.com/socialforge/backend/internal/services/notifications"
)

// MembersHandler handles workspace membership endpoints.
type MembersHandler struct {
	workspaces    repository.WorkspaceRepository
	users         repository.UserRepository
	notifications *notifications.Service
	cfg           *config.Config
	log           *zap.Logger
}

// NewMembersHandler constructs a MembersHandler.
func NewMembersHandler(
	workspaces repository.WorkspaceRepository,
	users repository.UserRepository,
	notif *notifications.Service,
	cfg *config.Config,
	log *zap.Logger,
) *MembersHandler {
	return &MembersHandler{
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
			return notFound(c, "no user with that email — ask them to sign up first", "USER_NOT_FOUND")
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
	return c.JSON(fiber.Map{"data": fiber.Map{"message": "member removed"}})
}
