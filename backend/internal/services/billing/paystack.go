package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

const paystackBaseURL = "https://api.paystack.co"

type paystackInitRequest struct {
	Email       string                 `json:"email"`
	Amount      int64                  `json:"amount"` // in kobo (NGN * 100)
	Currency    string                 `json:"currency"`
	Reference   string                 `json:"reference"`
	Metadata    map[string]interface{} `json:"metadata"`
	CallbackURL string                 `json:"callback_url,omitempty"`
}

type paystackInitResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		AuthorizationURL string `json:"authorization_url"`
		AccessCode       string `json:"access_code"`
		Reference        string `json:"reference"`
	} `json:"data"`
}

type paystackVerifyResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Status    string                 `json:"status"` // "success" | "failed" | "abandoned"
		Reference string                 `json:"reference"`
		Amount    int64                  `json:"amount"` // in kobo
		Currency  string                 `json:"currency"`
		Metadata  map[string]interface{} `json:"metadata"`
		PaidAt    time.Time              `json:"paid_at"`
	} `json:"data"`
}

type paystackWebhookEvent struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func (s *Service) paystackRequest(ctx context.Context, method, path string, body interface{}, out interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("paystack marshal: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, paystackBaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("paystack new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.Paystack.SecretKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("paystack http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("paystack %s %s status %d: %s", method, path, resp.StatusCode, string(b))
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

// InitializePaystackTransaction creates a Paystack hosted checkout URL.
func (s *Service) InitializePaystackTransaction(
	ctx context.Context,
	topupID uuid.UUID,
	email string,
	pkg CreditPackage,
) (checkoutURL, reference string, err error) {
	ref := fmt.Sprintf("sf_topup_%s", topupID.String())

	ngnAmount := int64(pkg.PriceUSD * NGNPerUSD * 100) // kobo

	reqBody := paystackInitRequest{
		Email:    email,
		Amount:   ngnAmount,
		Currency: "NGN",
		Reference: ref,
		Metadata: map[string]interface{}{
			"topup_id":   topupID.String(),
			"package_id": pkg.ID,
			"credits":    pkg.Credits,
		},
	}

	var result paystackInitResponse
	if err := s.paystackRequest(ctx, http.MethodPost, "/transaction/initialize", reqBody, &result); err != nil {
		return "", "", err
	}
	if !result.Status {
		return "", "", fmt.Errorf("paystack initialize: %s", result.Message)
	}

	return result.Data.AuthorizationURL, ref, nil
}

// VerifyPaystackTransaction checks whether a transaction completed successfully.
func (s *Service) VerifyPaystackTransaction(ctx context.Context, reference string) (*paystackVerifyResponse, error) {
	var result paystackVerifyResponse
	if err := s.paystackRequest(ctx, http.MethodGet, "/transaction/verify/"+reference, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// HandlePaystackWebhook processes a Paystack webhook event.
func (s *Service) HandlePaystackWebhook(ctx context.Context, payload []byte, signature string) error {
	// Verify HMAC-SHA512 signature
	mac := hmac.New(sha512.New, []byte(s.cfg.Paystack.WebhookSecret))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return fmt.Errorf("paystack webhook: invalid signature")
	}

	var event paystackWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return fmt.Errorf("paystack webhook unmarshal: %w", err)
	}

	switch event.Event {
	case "charge.success":
		var data paystackVerifyResponse
		if err := json.Unmarshal(event.Data, &data.Data); err != nil {
			return fmt.Errorf("paystack charge.success unmarshal: %w", err)
		}
		meta := data.Data.Metadata
		topupIDStr, ok := meta["topup_id"].(string)
		if !ok {
			return fmt.Errorf("paystack webhook: missing topup_id in metadata")
		}
		topupID, err := uuid.Parse(topupIDStr)
		if err != nil {
			return fmt.Errorf("paystack webhook: invalid topup_id: %w", err)
		}
		return s.ApplyCreditTopUp(ctx, topupID)
	}

	return nil // ignore unknown events
}
