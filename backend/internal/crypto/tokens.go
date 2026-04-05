// Package crypto provides AES-256-GCM encryption/decryption for OAuth tokens
// stored in the database.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

var (
	ErrInvalidCiphertext = errors.New("crypto: invalid ciphertext")
	ErrDecryptionFailed  = errors.New("crypto: decryption failed")
)

// deriveKey returns a 32-byte AES-256 key derived from the provided secret via
// SHA-256, so keys of any length are safely normalised.
func deriveKey(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}

// Encrypt encrypts plaintext using AES-256-GCM with a random 12-byte nonce.
// The returned string is base64url-encoded: <12-byte nonce> || <ciphertext+tag>.
func Encrypt(plaintext, secret string) (string, error) {
	key := deriveKey(secret)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypto: new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("crypto: generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

// Decrypt reverses Encrypt. Returns the original plaintext or an error.
func Decrypt(encoded, secret string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("%w: base64 decode: %v", ErrInvalidCiphertext, err)
	}

	key := deriveKey(secret)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("crypto: new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: new gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrDecryptionFailed, err)
	}

	return string(plaintext), nil
}

// MustEncrypt encrypts plaintext and panics on error. Suitable for use only in
// tests or startup paths where a failure is truly unrecoverable.
func MustEncrypt(plaintext, secret string) string {
	enc, err := Encrypt(plaintext, secret)
	if err != nil {
		panic(err)
	}
	return enc
}
