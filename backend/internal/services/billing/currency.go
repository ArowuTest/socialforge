package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
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

// NGNPerUSD is the FALLBACK Naira exchange rate. The live rate is loaded from
// platform_settings.ngn_per_usd via LoadNGNRate so admins can update it from
// the admin portal without a redeploy. Kept as a public const for the rare
// caller that has no DB context (mostly tests).
const NGNPerUSD = 1600.0

// ngnRateCache caches the platform_settings.ngn_per_usd value for ~5 minutes.
// Currency conversion is on the billing critical path so the lookup is hot.
type ngnRateCache struct {
	mu       sync.RWMutex
	rate     float64
	loadedAt time.Time
}

var globalNGNRateCache = &ngnRateCache{rate: NGNPerUSD}

// LoadNGNRate returns the current NGN-per-USD rate. Falls back to the
// NGNPerUSD constant if platform_settings is unreachable or the row is
// missing/invalid. Cached for 5 minutes.
func LoadNGNRate(ctx context.Context, db *gorm.DB) float64 {
	globalNGNRateCache.mu.RLock()
	if time.Since(globalNGNRateCache.loadedAt) < 5*time.Minute && globalNGNRateCache.rate > 0 {
		rate := globalNGNRateCache.rate
		globalNGNRateCache.mu.RUnlock()
		return rate
	}
	globalNGNRateCache.mu.RUnlock()

	rate := NGNPerUSD
	if db != nil {
		var val string
		db.WithContext(ctx).
			Raw(`SELECT value FROM platform_settings WHERE key = 'ngn_per_usd'`).
			Scan(&val)
		if val != "" {
			if v, err := strconv.ParseFloat(val, 64); err == nil && v > 0 {
				rate = v
			}
		}
	}

	globalNGNRateCache.mu.Lock()
	globalNGNRateCache.rate = rate
	globalNGNRateCache.loadedAt = time.Now()
	globalNGNRateCache.mu.Unlock()
	return rate
}

// InvalidateNGNRateCache forces the next LoadNGNRate call to reread from DB.
// Called from the admin settings handler when admins update the rate.
func InvalidateNGNRateCache() {
	globalNGNRateCache.mu.Lock()
	globalNGNRateCache.rate = 0
	globalNGNRateCache.loadedAt = time.Time{}
	globalNGNRateCache.mu.Unlock()
}

// CreditPackages returns the available top-up packages in the given currency.
// Use this only when you don't have a DB context (e.g. tests). New code should
// prefer CreditPackagesWithRate so the NGN prices reflect the admin-set FX
// rate from platform_settings.
func CreditPackages(currency string) []CreditPackage {
	if currency == "NGN" {
		return ngnPackages
	}
	return usdPackages
}

// CreditPackagesWithRate returns the credit packages with NGN display prices
// recomputed from the supplied rate (typically loaded from platform_settings
// via LoadNGNRate). Falls back to the static ngnPackages table when rate <= 0.
func CreditPackagesWithRate(currency string, ngnRate float64) []CreditPackage {
	if currency != "NGN" {
		return usdPackages
	}
	if ngnRate <= 0 {
		return ngnPackages
	}
	out := make([]CreditPackage, len(usdPackages))
	for i, p := range usdPackages {
		ngn := p.PriceUSD * ngnRate
		out[i] = CreditPackage{
			ID:           p.ID,
			Credits:      p.Credits,
			PriceUSD:     p.PriceUSD,
			DisplayPrice: fmt.Sprintf("₦%s", formatThousands(int64(ngn))),
			Currency:     "NGN",
			BestValue:    p.BestValue,
		}
	}
	return out
}

// formatThousands turns 80000 -> "80,000". Local-only helper, no i18n.
func formatThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	// Insert commas from the right.
	out := make([]byte, 0, len(s)+len(s)/3)
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, byte(c))
	}
	return string(out)
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
