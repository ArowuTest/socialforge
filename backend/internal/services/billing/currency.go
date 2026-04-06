package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// CreditPackage describes a purchasable credit bundle.
type CreditPackage struct {
	ID           string  `json:"id"`
	Credits      int     `json:"credits"`
	PriceUSD     float64 `json:"price_usd"`
	DisplayPrice string  `json:"display_price"`
	Currency     string  `json:"currency"`
	BestValue    bool    `json:"best_value,omitempty"`
}

var usdPackages = []CreditPackage{
	{ID: "credits_100", Credits: 100, PriceUSD: 5, DisplayPrice: "$5", Currency: "USD"},
	{ID: "credits_500", Credits: 500, PriceUSD: 20, DisplayPrice: "$20", Currency: "USD"},
	{ID: "credits_1500", Credits: 1500, PriceUSD: 50, DisplayPrice: "$50", Currency: "USD", BestValue: true},
	{ID: "credits_5000", Credits: 5000, PriceUSD: 150, DisplayPrice: "$150", Currency: "USD"},
}

var ngnPackages = []CreditPackage{
	{ID: "credits_100", Credits: 100, PriceUSD: 5, DisplayPrice: "₦8,000", Currency: "NGN"},
	{ID: "credits_500", Credits: 500, PriceUSD: 20, DisplayPrice: "₦32,000", Currency: "NGN"},
	{ID: "credits_1500", Credits: 1500, PriceUSD: 50, DisplayPrice: "₦80,000", Currency: "NGN", BestValue: true},
	{ID: "credits_5000", Credits: 5000, PriceUSD: 150, DisplayPrice: "₦240,000", Currency: "NGN"},
}

// NGNPerUSD is the approximate Naira exchange rate used for display.
// In production this should be fetched from an FX API (e.g. exchangerate-api.com).
const NGNPerUSD = 1600.0

// CreditPackages returns the available top-up packages in the given currency.
func CreditPackages(currency string) []CreditPackage {
	if currency == "NGN" {
		return ngnPackages
	}
	return usdPackages
}

// PackageByID looks up a package by ID in the given currency.
func PackageByID(id, currency string) (CreditPackage, bool) {
	for _, p := range CreditPackages(currency) {
		if p.ID == id {
			return p, true
		}
	}
	return CreditPackage{}, false
}

type ipAPIResponse struct {
	CountryCode string `json:"countryCode"`
	Status      string `json:"status"`
}

// DetectCurrency returns "NGN" if the IP resolves to Nigeria, otherwise "USD".
// Results are cached in Redis for 24 hours.
func DetectCurrency(ctx context.Context, ipAddress string, rdb *redis.Client, httpClient *http.Client) string {
	if ipAddress == "" || ipAddress == "127.0.0.1" || ipAddress == "::1" {
		return "USD"
	}

	cacheKey := fmt.Sprintf("geo:currency:%s", ipAddress)

	if rdb != nil {
		if cached, err := rdb.Get(ctx, cacheKey).Result(); err == nil {
			return cached
		}
	}

	if httpClient == nil {
		httpClient = &http.Client{Timeout: 3 * time.Second}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("http://ip-api.com/json/%s?fields=status,countryCode", ipAddress), nil)
	if err != nil {
		return "USD"
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "USD"
	}
	defer resp.Body.Close()

	var result ipAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "USD"
	}

	currency := "USD"
	if result.Status == "success" && result.CountryCode == "NG" {
		currency = "NGN"
	}

	if rdb != nil {
		rdb.Set(ctx, cacheKey, currency, 24*time.Hour)
	}

	return currency
}
