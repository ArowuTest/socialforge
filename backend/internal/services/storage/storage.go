// Package storage provides a cloud-agnostic object storage layer.
// It uses the AWS SDK v2 S3 client with custom endpoint support, making it
// compatible with AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO,
// Backblaze B2, Wasabi, and any other S3-compatible storage provider.
package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"
)

// Config holds object storage settings. Works with any S3-compatible provider.
type Config struct {
	Endpoint        string // e.g. "https://xyz.r2.cloudflarestorage.com" or empty for AWS
	Bucket          string
	Region          string // "auto" for R2, "us-east-1" for AWS, etc.
	AccessKeyID     string
	SecretAccessKey string
	PublicURL       string // CDN / public URL prefix for serving files (optional)
}

// Service is the cloud-agnostic storage service.
type Service struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
	publicURL string
	log       *zap.Logger
}

// New creates a new storage Service. Returns nil if config is incomplete
// (no bucket or no credentials), allowing the app to start without storage.
func New(cfg Config, log *zap.Logger) *Service {
	if cfg.Bucket == "" || cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" {
		log.Warn("storage: incomplete config — media uploads disabled",
			zap.Bool("has_bucket", cfg.Bucket != ""),
			zap.Bool("has_key", cfg.AccessKeyID != ""),
		)
		return nil
	}

	region := cfg.Region
	if region == "" {
		region = "auto"
	}

	resolver := aws.EndpointResolverWithOptionsFunc(
		func(service, r string, options ...interface{}) (aws.Endpoint, error) {
			if cfg.Endpoint != "" {
				return aws.Endpoint{
					URL:               cfg.Endpoint,
					HostnameImmutable: true,
					SigningRegion:      region,
				}, nil
			}
			return aws.Endpoint{}, &aws.EndpointNotFoundError{}
		},
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
		awsconfig.WithEndpointResolverWithOptions(resolver),
	)
	if err != nil {
		log.Error("storage: failed to create AWS config", zap.Error(err))
		return nil
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.UsePathStyle = true // Required for R2, MinIO, etc.
		}
	})

	return &Service{
		client:    client,
		presigner: s3.NewPresignClient(client),
		bucket:    cfg.Bucket,
		publicURL: cfg.PublicURL,
		log:       log.Named("storage"),
	}
}

// PresignPutResult holds the result of a presigned PUT request.
type PresignPutResult struct {
	UploadURL string `json:"upload_url"`
	PublicURL string `json:"public_url"`
	Key       string `json:"key"`
}

// PresignPut generates a presigned PUT URL for direct client-side upload.
// The URL is valid for the specified duration (default 15 minutes).
func (s *Service) PresignPut(ctx context.Context, key, contentType string, ttl time.Duration) (*PresignPutResult, error) {
	if ttl == 0 {
		ttl = 15 * time.Minute
	}

	req, err := s.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return nil, fmt.Errorf("storage: presign PUT: %w", err)
	}

	publicURL := s.buildPublicURL(key)

	s.log.Debug("presigned PUT generated",
		zap.String("key", key),
		zap.String("content_type", contentType),
		zap.Duration("ttl", ttl),
	)

	return &PresignPutResult{
		UploadURL: req.URL,
		PublicURL: publicURL,
		Key:       key,
	}, nil
}

// PresignGet generates a presigned GET URL for private objects.
func (s *Service) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if ttl == 0 {
		ttl = 1 * time.Hour
	}

	req, err := s.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("storage: presign GET: %w", err)
	}

	return req.URL, nil
}

// Delete removes an object from storage.
func (s *Service) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("storage: delete %q: %w", key, err)
	}

	s.log.Info("object deleted", zap.String("key", key))
	return nil
}

// IsConfigured returns true if the service is ready to use.
func (s *Service) IsConfigured() bool {
	return s != nil && s.client != nil
}

// buildPublicURL constructs the public-facing URL for an object.
func (s *Service) buildPublicURL(key string) string {
	if s.publicURL != "" {
		return fmt.Sprintf("%s/%s", s.publicURL, key)
	}
	// Fallback: construct from bucket endpoint
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", s.bucket, key)
}
