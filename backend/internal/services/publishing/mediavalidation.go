// Package publishing provides the multi-platform post publishing service.
package publishing

import (
	"fmt"
	"net/http"
	"path"
	"strings"
)

// OutboundMediaConstraints defines allowed media formats and size limits for
// outbound publishing to a specific platform. This complements the existing
// PlatformMediaConstraints (media.go) which validates local files; this struct
// validates media URLs before they are sent to platform APIs.
type OutboundMediaConstraints struct {
	AllowedImageFormats []string // e.g. ["jpeg", "jpg", "png", "webp"]
	AllowedVideoFormats []string // e.g. ["mp4", "mov"]
	MaxImageSizeMB      int
	MaxVideoSizeMB      int
	MaxVideoDurationSec int
	MinWidth            int
	MinHeight           int
}

// outboundMediaConstraints maps each platform to its outbound media constraints.
var outboundMediaConstraints = map[string]OutboundMediaConstraints{
	"instagram": {
		AllowedImageFormats: []string{"jpeg", "jpg", "png"},
		AllowedVideoFormats: []string{"mp4", "mov"},
		MaxImageSizeMB: 8, MaxVideoSizeMB: 100,
		MaxVideoDurationSec: 90, MinWidth: 320, MinHeight: 320,
	},
	"tiktok": {
		AllowedVideoFormats: []string{"mp4", "webm"},
		MaxVideoSizeMB: 287, MaxVideoDurationSec: 600,
		MinWidth: 360, MinHeight: 640,
	},
	"twitter": {
		AllowedImageFormats: []string{"jpeg", "jpg", "png", "gif", "webp"},
		AllowedVideoFormats: []string{"mp4"},
		MaxImageSizeMB: 5, MaxVideoSizeMB: 512,
		MaxVideoDurationSec: 140,
	},
	"linkedin": {
		AllowedImageFormats: []string{"jpeg", "jpg", "png", "gif"},
		AllowedVideoFormats: []string{"mp4"},
		MaxImageSizeMB: 10, MaxVideoSizeMB: 200,
		MaxVideoDurationSec: 600,
	},
	"facebook": {
		AllowedImageFormats: []string{"jpeg", "jpg", "png", "gif", "bmp", "tiff", "webp"},
		AllowedVideoFormats: []string{"mp4", "mov", "avi"},
		MaxImageSizeMB: 10, MaxVideoSizeMB: 1024,
		MaxVideoDurationSec: 14400,
	},
	"youtube": {
		AllowedVideoFormats: []string{"mp4", "mov", "avi", "wmv", "flv", "webm", "mkv"},
		MaxVideoSizeMB: 128000, MaxVideoDurationSec: 43200,
	},
	"pinterest": {
		AllowedImageFormats: []string{"jpeg", "jpg", "png"},
		AllowedVideoFormats: []string{"mp4", "mov"},
		MaxImageSizeMB: 20, MaxVideoSizeMB: 2048,
		MaxVideoDurationSec: 900,
	},
	"threads": {
		AllowedImageFormats: []string{"jpeg", "jpg", "png"},
		AllowedVideoFormats: []string{"mp4", "mov"},
		MaxImageSizeMB: 8, MaxVideoSizeMB: 100,
		MaxVideoDurationSec: 300,
	},
}

// ValidateMediaURLForPlatform checks if the media URL's format is supported by
// the target platform. It inspects the file extension and, when absent, issues
// a HEAD request to determine the content type. Returns nil if valid.
func ValidateMediaURLForPlatform(mediaURL, platform string) error {
	constraints, ok := outboundMediaConstraints[platform]
	if !ok {
		return nil // unknown platform, skip validation
	}

	ext := strings.TrimPrefix(strings.ToLower(path.Ext(mediaURL)), ".")
	if ext == "" {
		// Try to determine from content-type via HEAD request.
		resp, err := http.Head(mediaURL) //nolint:gosec
		if err == nil {
			defer resp.Body.Close()
			ct := resp.Header.Get("Content-Type")
			if strings.Contains(ct, "image/") {
				ext = strings.TrimPrefix(ct, "image/")
			} else if strings.Contains(ct, "video/") {
				ext = strings.TrimPrefix(ct, "video/")
			}
		}
	}

	isImage := containsStr(constraints.AllowedImageFormats, ext)
	isVideo := containsStr(constraints.AllowedVideoFormats, ext)

	if !isImage && !isVideo {
		all := append(constraints.AllowedImageFormats, constraints.AllowedVideoFormats...)
		return fmt.Errorf("media format '%s' is not supported by %s (allowed: %s)", ext, platform, strings.Join(all, ", "))
	}

	return nil
}
