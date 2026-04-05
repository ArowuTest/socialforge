// Package scheduling provides the core business logic for managing schedule
// slots, auto-assigning posts to free slots, and producing calendar views.
package scheduling

import (
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	ErrSlotNotFound    = errors.New("schedule slot not found")
	ErrNoFreeSlot      = errors.New("no free schedule slot available")
	ErrPastScheduleTime = errors.New("scheduled time must be in the future")
	ErrPostNotFound    = errors.New("post not found")
)

// ─── Service ─────────────────────────────────────────────────────────────────

// Service encapsulates scheduling business logic.
type Service struct {
	db  *gorm.DB
	log *zap.Logger
}

// New creates a new scheduling Service.
func New(db *gorm.DB, log *zap.Logger) *Service {
	return &Service{db: db, log: log}
}

// ─── CreateScheduleSlot ───────────────────────────────────────────────────────

// CreateScheduleSlot persists a new recurring time slot for a workspace/platform pair.
// dayOfWeek: 0 = Sunday … 6 = Saturday.
// timeOfDay: "HH:MM" in 24-hour format.
// timezone: IANA timezone string, e.g. "America/New_York".
func (s *Service) CreateScheduleSlot(
	workspaceID uuid.UUID,
	platform string,
	dayOfWeek int,
	timeOfDay string,
	timezone string,
) (*models.ScheduleSlot, error) {
	if dayOfWeek < 0 || dayOfWeek > 6 {
		return nil, fmt.Errorf("dayOfWeek must be 0–6, got %d", dayOfWeek)
	}
	if len(timeOfDay) != 5 || timeOfDay[2] != ':' {
		return nil, fmt.Errorf("timeOfDay must be HH:MM format, got %q", timeOfDay)
	}
	if _, err := time.LoadLocation(timezone); err != nil {
		return nil, fmt.Errorf("invalid timezone %q: %w", timezone, err)
	}

	slot := &models.ScheduleSlot{
		WorkspaceID: workspaceID,
		Platform:    platform,
		DayOfWeek:   dayOfWeek,
		TimeOfDay:   timeOfDay,
		Timezone:    timezone,
		IsActive:    true,
	}

	if err := s.db.Create(slot).Error; err != nil {
		return nil, fmt.Errorf("CreateScheduleSlot: %w", err)
	}

	s.log.Info("schedule slot created",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("platform", platform),
		zap.Int("day_of_week", dayOfWeek),
		zap.String("time_of_day", timeOfDay),
	)
	return slot, nil
}

// ─── GetNextFreeSlot ──────────────────────────────────────────────────────────

// GetNextFreeSlot returns the next datetime for which the workspace has a
// schedule slot defined but no post yet assigned.
// It scans up to 4 weeks into the future before giving up.
func (s *Service) GetNextFreeSlot(workspaceID uuid.UUID, platform string) (time.Time, error) {
	var slots []models.ScheduleSlot
	if err := s.db.
		Where("workspace_id = ? AND platform = ? AND is_active = true", workspaceID, platform).
		Find(&slots).Error; err != nil {
		return time.Time{}, fmt.Errorf("GetNextFreeSlot: query slots: %w", err)
	}
	if len(slots) == 0 {
		return time.Time{}, ErrNoFreeSlot
	}

	// Build candidate times for the next 4 weeks, sorted ascending.
	now := time.Now().UTC()
	candidates := make([]time.Time, 0, len(slots)*4)
	for _, slot := range slots {
		loc, _ := time.LoadLocation(slot.Timezone)
		for weeksAhead := 0; weeksAhead < 4; weeksAhead++ {
			// Find the next occurrence of this weekday.
			t := nextWeekday(now, slot.DayOfWeek, slot.TimeOfDay, loc, weeksAhead)
			if t.After(now) {
				candidates = append(candidates, t)
			}
		}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].Before(candidates[j]) })

	// Find the first candidate that has no post already assigned.
	for _, candidate := range candidates {
		window := 10 * time.Minute
		var count int64
		if err := s.db.Model(&models.Post{}).
			Where(`workspace_id = ? AND platform = ?
				AND scheduled_at >= ? AND scheduled_at < ?
				AND status IN ('scheduled','publishing','published')`,
				workspaceID, platform,
				candidate.Add(-window), candidate.Add(window),
			).Count(&count).Error; err != nil {
			return time.Time{}, fmt.Errorf("GetNextFreeSlot: count posts: %w", err)
		}
		if count == 0 {
			return candidate, nil
		}
	}

	return time.Time{}, ErrNoFreeSlot
}

// nextWeekday computes the next occurrence of the given weekday (0=Sun) in the
// provided timezone, starting from base, offset by weeksAhead full weeks.
func nextWeekday(base time.Time, dayOfWeek int, timeOfDay string, loc *time.Location, weeksAhead int) time.Time {
	// Parse HH:MM.
	var hour, min int
	fmt.Sscanf(timeOfDay, "%d:%d", &hour, &min)

	localBase := base.In(loc)
	daysUntil := (dayOfWeek - int(localBase.Weekday()) + 7) % 7
	if daysUntil == 0 {
		// Same weekday — only use today if the time is still in the future.
		candidate := time.Date(localBase.Year(), localBase.Month(), localBase.Day(), hour, min, 0, 0, loc)
		if candidate.After(base) && weeksAhead == 0 {
			return candidate.UTC()
		}
		daysUntil = 7
	}
	target := localBase.AddDate(0, 0, daysUntil+(weeksAhead*7))
	return time.Date(target.Year(), target.Month(), target.Day(), hour, min, 0, 0, loc).UTC()
}

// ─── SchedulePost ─────────────────────────────────────────────────────────────

// SchedulePost sets the scheduled_at time for a post and transitions it to the
// 'scheduled' status. Returns an error if scheduledAt is in the past.
func (s *Service) SchedulePost(postID uuid.UUID, scheduledAt time.Time) (*models.Post, error) {
	if !scheduledAt.After(time.Now().UTC()) {
		return nil, ErrPastScheduleTime
	}

	var post models.Post
	if err := s.db.First(&post, "id = ?", postID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPostNotFound
		}
		return nil, fmt.Errorf("SchedulePost: fetch post: %w", err)
	}

	t := scheduledAt.UTC()
	if err := s.db.Model(&post).Updates(map[string]interface{}{
		"scheduled_at": t,
		"status":       "scheduled",
	}).Error; err != nil {
		return nil, fmt.Errorf("SchedulePost: update: %w", err)
	}
	post.ScheduledAt = &t
	post.Status = "scheduled"

	s.log.Info("post scheduled",
		zap.String("post_id", postID.String()),
		zap.Time("scheduled_at", t),
	)
	return &post, nil
}

// ─── BulkSchedule ─────────────────────────────────────────────────────────────

// BulkScheduleResult holds the outcome for a single post in a bulk operation.
type BulkScheduleResult struct {
	PostID      uuid.UUID `json:"post_id"`
	ScheduledAt time.Time `json:"scheduled_at,omitempty"`
	Error       string    `json:"error,omitempty"`
}

// BulkSchedule assigns consecutive free schedule slots to the provided posts.
// Posts are processed in the order given; each successfully scheduled post
// consumes a slot, shifting subsequent posts forward.
func (s *Service) BulkSchedule(posts []models.Post) []BulkScheduleResult {
	results := make([]BulkScheduleResult, len(posts))

	// Track consumed slots per platform so we can advance past each used one.
	// We do this by re-querying GetNextFreeSlot after recording each assignment
	// in-memory as a temporary blocked window.
	type slotUsage struct {
		platform string
		at       time.Time
	}
	used := make([]slotUsage, 0)

	isUsed := func(platform string, candidate time.Time) bool {
		window := 10 * time.Minute
		for _, u := range used {
			if u.platform == platform &&
				candidate.After(u.at.Add(-window)) &&
				candidate.Before(u.at.Add(window)) {
				return true
			}
		}
		return false
	}

	for i, post := range posts {
		// Find the first free slot for this post's platform.
		var assigned time.Time
		for attempt := 0; attempt < 30; attempt++ {
			candidate, err := s.GetNextFreeSlot(post.WorkspaceID, post.Platform)
			if err != nil {
				results[i] = BulkScheduleResult{PostID: post.ID, Error: err.Error()}
				break
			}
			if !isUsed(post.Platform, candidate) {
				assigned = candidate
				break
			}
			// If that slot is taken by a post we already assigned in this batch,
			// advance by one week and try again.
			candidate = candidate.AddDate(0, 0, 7)
			if !isUsed(post.Platform, candidate) {
				assigned = candidate
				break
			}
		}

		if assigned.IsZero() {
			if results[i].Error == "" {
				results[i] = BulkScheduleResult{PostID: post.ID, Error: "no free slot found"}
			}
			continue
		}

		if _, err := s.SchedulePost(post.ID, assigned); err != nil {
			results[i] = BulkScheduleResult{PostID: post.ID, Error: err.Error()}
			continue
		}

		used = append(used, slotUsage{platform: post.Platform, at: assigned})
		results[i] = BulkScheduleResult{PostID: post.ID, ScheduledAt: assigned}
	}

	return results
}

// ─── GetCalendar ──────────────────────────────────────────────────────────────

// CalendarDay groups posts for a single calendar date.
type CalendarDay struct {
	Date  string         `json:"date"`  // "YYYY-MM-DD"
	Posts []models.Post  `json:"posts"`
}

// GetCalendar returns scheduled/published posts for a workspace grouped by day,
// covering the half-open interval [startDate, endDate).
func (s *Service) GetCalendar(workspaceID uuid.UUID, startDate, endDate time.Time) ([]CalendarDay, error) {
	start := startDate.UTC().Truncate(24 * time.Hour)
	end := endDate.UTC().Truncate(24 * time.Hour)
	if !end.After(start) {
		return nil, fmt.Errorf("GetCalendar: endDate must be after startDate")
	}

	var posts []models.Post
	if err := s.db.
		Preload("SocialAccount").
		Where(`workspace_id = ?
			AND scheduled_at >= ?
			AND scheduled_at < ?
			AND status IN ('scheduled','publishing','published','failed')`,
			workspaceID, start, end,
		).
		Order("scheduled_at ASC").
		Find(&posts).Error; err != nil {
		return nil, fmt.Errorf("GetCalendar: query: %w", err)
	}

	// Group into days.
	days := make(map[string][]models.Post)
	for _, p := range posts {
		if p.ScheduledAt == nil {
			continue
		}
		key := p.ScheduledAt.UTC().Format("2006-01-02")
		days[key] = append(days[key], p)
	}

	// Build sorted slice covering every date in range.
	result := make([]CalendarDay, 0)
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		cd := CalendarDay{Date: key, Posts: days[key]}
		if cd.Posts == nil {
			cd.Posts = []models.Post{}
		}
		result = append(result, cd)
	}

	return result, nil
}

// ─── DeleteScheduleSlot ───────────────────────────────────────────────────────

// DeleteScheduleSlot removes a schedule slot by ID, ensuring it belongs to the
// workspace (prevents cross-workspace deletion).
func (s *Service) DeleteScheduleSlot(slotID, workspaceID uuid.UUID) error {
	result := s.db.
		Where("id = ? AND workspace_id = ?", slotID, workspaceID).
		Delete(&models.ScheduleSlot{})
	if result.Error != nil {
		return fmt.Errorf("DeleteScheduleSlot: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrSlotNotFound
	}
	return nil
}

// ─── ListScheduleSlots ────────────────────────────────────────────────────────

// ListScheduleSlots returns all active slots for a workspace, optionally
// filtered by platform.
func (s *Service) ListScheduleSlots(workspaceID uuid.UUID, platform string) ([]models.ScheduleSlot, error) {
	q := s.db.Where("workspace_id = ? AND is_active = true", workspaceID)
	if platform != "" {
		q = q.Where("platform = ?", platform)
	}
	var slots []models.ScheduleSlot
	if err := q.Order("day_of_week, time_of_day").Find(&slots).Error; err != nil {
		return nil, fmt.Errorf("ListScheduleSlots: %w", err)
	}
	return slots, nil
}
