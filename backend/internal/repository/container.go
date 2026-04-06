package repository

import "gorm.io/gorm"

// Container holds all repository implementations.
type Container struct {
	Users          UserRepository
	Workspaces     WorkspaceRepository
	Posts          PostRepository
	SocialAccounts SocialAccountRepository
	ScheduleSlots  ScheduleSlotRepository
	APIKeys        APIKeyRepository
	AIJobs         AIJobRepository
	AuditLogs      AuditLogRepository
	Analytics      AnalyticsRepository
}

// NewContainer creates a Container with all GORM implementations wired to the
// provided *gorm.DB instance.
func NewContainer(db *gorm.DB) *Container {
	return &Container{
		Users:          NewUserRepo(db),
		Workspaces:     NewWorkspaceRepo(db),
		Posts:          NewPostRepo(db),
		SocialAccounts: NewSocialAccountRepo(db),
		ScheduleSlots:  NewScheduleSlotRepo(db),
		APIKeys:        NewAPIKeyRepo(db),
		AIJobs:         NewAIJobRepo(db),
		AuditLogs:      NewAuditLogRepo(db),
		Analytics:      NewAnalyticsRepo(db),
	}
}
