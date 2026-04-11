package publishing

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/config"
)

// MediaService handles media file operations: download, upload, validation, and conversion.
type MediaService struct {
	cfg        *config.Config
	httpClient *http.Client
	s3Client   *s3.Client
	log        *zap.Logger
}

// NewMediaService creates a MediaService wired to Cloudflare R2.
func NewMediaService(cfg *config.Config, log *zap.Logger) *MediaService {
	ms := &MediaService{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 5 * time.Minute},
		log:        log.Named("media_service"),
	}

	// Initialise S3-compatible client for R2.
	r2Resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{URL: cfg.Storage.Endpoint}, nil
	})

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithEndpointResolverWithOptions(r2Resolver),
		awsconfig.WithRegion(cfg.Storage.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.Storage.AccessKeyID,
			cfg.Storage.SecretAccessKey,
			"",
		)),
	)
	if err != nil {
		log.Error("NewMediaService: failed to configure S3 client", zap.Error(err))
		return ms
	}

	ms.s3Client = s3.NewFromConfig(awsCfg)
	return ms
}

// ── DownloadMedia ─────────────────────────────────────────────────────────────

// DownloadMedia fetches a remote URL and saves it to a temp file.
// The caller is responsible for removing the file when done.
func (ms *MediaService) DownloadMedia(ctx context.Context, mediaURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return "", fmt.Errorf("DownloadMedia: build request: %w", err)
	}
	req.Header.Set("User-Agent", "ChiselPost/1.0")

	resp, err := ms.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("DownloadMedia: http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("DownloadMedia: HTTP %d for %s", resp.StatusCode, mediaURL)
	}

	// Determine extension from Content-Type or URL.
	ext := extensionFromURL(mediaURL)
	if ext == "" {
		ext = extensionFromContentType(resp.Header.Get("Content-Type"))
	}
	if ext == "" {
		ext = ".bin"
	}

	tmpFile, err := os.CreateTemp("", "socialforge-media-*"+ext)
	if err != nil {
		return "", fmt.Errorf("DownloadMedia: create temp file: %w", err)
	}
	defer tmpFile.Close()

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("DownloadMedia: write temp file: %w", err)
	}

	ms.log.Debug("DownloadMedia: saved", zap.String("path", tmpFile.Name()), zap.String("url", mediaURL))
	return tmpFile.Name(), nil
}

// ── UploadToR2 ────────────────────────────────────────────────────────────────

// UploadToR2 uploads a local file to Cloudflare R2 and returns the CDN URL.
func (ms *MediaService) UploadToR2(ctx context.Context, filePath, key string) (string, error) {
	if ms.s3Client == nil {
		return "", fmt.Errorf("UploadToR2: S3 client not configured")
	}

	f, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("UploadToR2: open file: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return "", fmt.Errorf("UploadToR2: stat file: %w", err)
	}

	contentType := contentTypeFromExt(filepath.Ext(filePath))

	_, err = ms.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(ms.cfg.Storage.Bucket),
		Key:           aws.String(key),
		Body:          f,
		ContentLength: aws.Int64(stat.Size()),
		ContentType:   aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("UploadToR2: PutObject: %w", err)
	}

	baseURL := ms.cfg.Storage.PublicURL
	if baseURL == "" {
		baseURL = ms.cfg.Storage.Endpoint + "/" + ms.cfg.Storage.Bucket
	}
	cdnURL := strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(key, "/")

	ms.log.Info("UploadToR2: uploaded", zap.String("key", key), zap.String("url", cdnURL))
	return cdnURL, nil
}

// UploadBytesToR2 uploads raw bytes directly to R2.
func (ms *MediaService) UploadBytesToR2(ctx context.Context, data []byte, key, contentType string) (string, error) {
	if ms.s3Client == nil {
		return "", fmt.Errorf("UploadBytesToR2: S3 client not configured")
	}

	_, err := ms.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(ms.cfg.Storage.Bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(data),
		ContentLength: aws.Int64(int64(len(data))),
		ContentType:   aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("UploadBytesToR2: PutObject: %w", err)
	}

	baseURL := ms.cfg.Storage.PublicURL
	if baseURL == "" {
		baseURL = ms.cfg.Storage.Endpoint + "/" + ms.cfg.Storage.Bucket
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(key, "/"), nil
}

// ── GetMediaType ──────────────────────────────────────────────────────────────

// GetMediaType returns "image", "video", or "unknown" based on file extension.
func (ms *MediaService) GetMediaType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp", ".tiff":
		return "image"
	case ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".3gp", ".flv":
		return "video"
	default:
		return "unknown"
	}
}

// ── ValidateMediaForPlatform ──────────────────────────────────────────────────

// PlatformMediaConstraints defines media limits per platform.
type PlatformMediaConstraints struct {
	MaxImageSizeMB  int
	MaxVideoSizeMB  int
	MaxVideoDurSec  int
	AllowedImageFmt []string
	AllowedVideoFmt []string
	MinWidth        int
	MinHeight       int
}

var platformConstraints = map[string]PlatformMediaConstraints{
	"instagram": {
		MaxImageSizeMB: 8, MaxVideoSizeMB: 650, MaxVideoDurSec: 3600,
		AllowedImageFmt: []string{".jpg", ".jpeg", ".png"},
		AllowedVideoFmt: []string{".mp4", ".mov"},
		MinWidth: 320, MinHeight: 320,
	},
	"tiktok": {
		MaxImageSizeMB: 10, MaxVideoSizeMB: 4096, MaxVideoDurSec: 600,
		AllowedVideoFmt: []string{".mp4", ".mov", ".webm"},
	},
	"youtube": {
		MaxVideoSizeMB: 128 * 1024, MaxVideoDurSec: 43200, // 12 hours
		AllowedVideoFmt: []string{".mp4", ".mov", ".avi", ".mkv", ".webm"},
	},
	"twitter": {
		MaxImageSizeMB: 5, MaxVideoSizeMB: 512, MaxVideoDurSec: 140,
		AllowedImageFmt: []string{".jpg", ".jpeg", ".png", ".gif", ".webp"},
		AllowedVideoFmt: []string{".mp4", ".mov"},
	},
	"facebook": {
		MaxImageSizeMB: 25, MaxVideoSizeMB: 10240, MaxVideoDurSec: 14400,
		AllowedImageFmt: []string{".jpg", ".jpeg", ".png", ".gif"},
		AllowedVideoFmt: []string{".mp4", ".mov", ".avi"},
	},
	"linkedin": {
		MaxImageSizeMB: 10, MaxVideoSizeMB: 5120, MaxVideoDurSec: 600,
		AllowedImageFmt: []string{".jpg", ".jpeg", ".png", ".gif"},
		AllowedVideoFmt: []string{".mp4", ".mov", ".avi"},
	},
	"pinterest": {
		MaxImageSizeMB: 32, MaxVideoSizeMB: 2048, MaxVideoDurSec: 900,
		AllowedImageFmt: []string{".jpg", ".jpeg", ".png"},
		AllowedVideoFmt: []string{".mp4", ".mov"},
	},
	"threads": {
		MaxImageSizeMB: 25, MaxVideoSizeMB: 1024, MaxVideoDurSec: 300,
		AllowedImageFmt: []string{".jpg", ".jpeg", ".png"},
		AllowedVideoFmt: []string{".mp4", ".mov"},
	},
}

// ValidateMediaForPlatform checks that the file meets the platform's constraints.
func (ms *MediaService) ValidateMediaForPlatform(filePath, platform string) error {
	constraints, ok := platformConstraints[platform]
	if !ok {
		return nil // no constraints defined = pass
	}

	stat, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("ValidateMediaForPlatform: stat %s: %w", filePath, err)
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	mediaType := ms.GetMediaType(filePath)
	sizeMB := float64(stat.Size()) / (1024 * 1024)

	switch mediaType {
	case "image":
		if constraints.MaxImageSizeMB > 0 && sizeMB > float64(constraints.MaxImageSizeMB) {
			return fmt.Errorf("image size %.1f MB exceeds %s limit of %d MB", sizeMB, platform, constraints.MaxImageSizeMB)
		}
		if len(constraints.AllowedImageFmt) > 0 && !containsStr(constraints.AllowedImageFmt, ext) {
			return fmt.Errorf("image format %s not supported by %s (allowed: %v)", ext, platform, constraints.AllowedImageFmt)
		}
	case "video":
		if constraints.MaxVideoSizeMB > 0 && sizeMB > float64(constraints.MaxVideoSizeMB) {
			return fmt.Errorf("video size %.1f MB exceeds %s limit of %d MB", sizeMB, platform, constraints.MaxVideoSizeMB)
		}
		if len(constraints.AllowedVideoFmt) > 0 && !containsStr(constraints.AllowedVideoFmt, ext) {
			return fmt.Errorf("video format %s not supported by %s (allowed: %v)", ext, platform, constraints.AllowedVideoFmt)
		}
	}

	return nil
}

// ── ConvertForPlatform ────────────────────────────────────────────────────────

// ConvertForPlatform uses ffmpeg to transcode media to the platform's preferred format.
// Returns the path to the converted file (temp file — caller must remove).
func (ms *MediaService) ConvertForPlatform(inputPath, platform string) (string, error) {
	mediaType := ms.GetMediaType(inputPath)

	var outExt, videoCodec, audioCodec string
	switch platform {
	case "instagram", "tiktok", "threads":
		outExt = ".mp4"
		videoCodec = "libx264"
		audioCodec = "aac"
	case "youtube":
		outExt = ".mp4"
		videoCodec = "libx264"
		audioCodec = "aac"
	default:
		outExt = ".mp4"
		videoCodec = "libx264"
		audioCodec = "aac"
	}

	if mediaType == "image" {
		// No conversion needed for images in most cases.
		return inputPath, nil
	}

	outFile, err := os.CreateTemp("", "socialforge-converted-*"+outExt)
	if err != nil {
		return "", fmt.Errorf("ConvertForPlatform: create temp file: %w", err)
	}
	outFile.Close()
	outPath := outFile.Name()

	// Run ffmpeg.
	args := []string{
		"-i", inputPath,
		"-c:v", videoCodec,
		"-c:a", audioCodec,
		"-movflags", "+faststart",
		"-y", // overwrite
		outPath,
	}

	cmd := exec.Command("ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		os.Remove(outPath)
		return "", fmt.Errorf("ConvertForPlatform: ffmpeg: %w\noutput: %s", err, string(out))
	}

	ms.log.Info("ConvertForPlatform: converted",
		zap.String("platform", platform),
		zap.String("input", inputPath),
		zap.String("output", outPath),
	)

	return outPath, nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func extensionFromURL(u string) string {
	// Strip query string.
	if idx := strings.Index(u, "?"); idx != -1 {
		u = u[:idx]
	}
	ext := filepath.Ext(u)
	if len(ext) > 5 {
		return ""
	}
	return strings.ToLower(ext)
}

func extensionFromContentType(ct string) string {
	ct = strings.ToLower(strings.Split(ct, ";")[0])
	switch strings.TrimSpace(ct) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	default:
		return ""
	}
}

func contentTypeFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	default:
		return "application/octet-stream"
	}
}

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
