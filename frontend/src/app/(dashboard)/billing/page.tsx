"use client";

import * as React from "react";
import {
  Zap,
  TrendingUp,
  CreditCard,
  History,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { billingApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  CreditPackage,
  CreditBalance,
  CreditLedgerEntry,
  BillingUsage,
  Currency,
  PlanType,
} from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Constants ────────────────────────────────────────────────────────────────

const ZERO_BALANCE: CreditBalance = {
  credit_balance: 0,
  plan_credits_used: 0,
  plan_credits_limit: 0,
  monthly_usd_cost: 0,
};

const LEDGER_PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ── Entry type config ────────────────────────────────────────────────────────

const entryTypeConfig: Record<
  CreditLedgerEntry["entry_type"],
  { label: string; colorClass: string; bgClass: string }
> = {
  monthly_grant: {
    label: "Monthly Grant",
    colorClass: "text-emerald-400",
    bgClass: "bg-emerald-900/30 text-emerald-400",
  },
  top_up: {
    label: "Top-up",
    colorClass: "text-violet-400",
    bgClass: "bg-violet-900/30 text-violet-400",
  },
  ai_debit: {
    label: "AI Usage",
    colorClass: "text-rose-400",
    bgClass: "bg-rose-900/30 text-rose-400",
  },
  refund: {
    label: "Refund",
    colorClass: "text-sky-400",
    bgClass: "bg-sky-900/30 text-sky-400",
  },
  adjustment: {
    label: "Adjustment",
    colorClass: "text-amber-400",
    bgClass: "bg-amber-900/30 text-amber-400",
  },
};

function ProviderIcon({ provider }: { provider?: string }) {
  if (!provider) return <span className="text-muted-foreground text-xs">—</span>;
  if (provider === "stripe") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400">
        <CreditCard className="h-3 w-3" /> Stripe
      </span>
    );
  }
  if (provider === "paystack") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-400">
        🇳🇬 Paystack
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground capitalize">{provider}</span>;
}

// ── Credit Balance Card ──────────────────────────────────────────────────────

function CreditBalanceCard({ balance }: { balance: CreditBalance }) {
  const planPct = balance.plan_credits_limit > 0
    ? Math.round((balance.plan_credits_used / balance.plan_credits_limit) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Purchased Credits */}
      <Card className="bg-gradient-to-br from-violet-950/60 to-slate-900 border-violet-800/40">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-violet-400" />
            </div>
            <Badge className="bg-violet-900/50 text-violet-300 border-violet-700/50 text-xs">
              Purchased
            </Badge>
          </div>
          <p className="text-3xl font-bold text-white">
            {balance.credit_balance.toLocaleString()}
          </p>
          <p className="text-sm text-slate-400 mt-1">Available credits</p>
        </CardContent>
      </Card>

      {/* Plan Credits */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-sky-600/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-sky-400" />
            </div>
            <Badge className="bg-sky-900/40 text-sky-300 border-sky-700/50 text-xs">
              Plan
            </Badge>
          </div>
          <p className="text-3xl font-bold text-white">
            {balance.plan_credits_used.toLocaleString()}
            <span className="text-lg text-slate-400 font-normal">
              /{balance.plan_credits_limit.toLocaleString()}
            </span>
          </p>
          <p className="text-sm text-slate-400 mt-1 mb-3">Plan credits used</p>
          <div className="space-y-1">
            <Progress
              value={planPct}
              className="h-1.5 bg-slate-700"
            />
            <p className="text-xs text-slate-500">{planPct}% used this cycle</p>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Cost */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-600/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-700/50 text-xs">
              This Month
            </Badge>
          </div>
          <p className="text-3xl font-bold text-white">
            ${balance.monthly_usd_cost.toFixed(2)}
          </p>
          <p className="text-sm text-slate-400 mt-1">AI usage cost</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Credit Packages Grid ─────────────────────────────────────────────────────

interface CreditPackagesGridProps {
  packages: CreditPackage[];
  currency: Currency;
  onCurrencyToggle: () => void;
  workspaceId: string;
}

function CreditPackagesGrid({
  packages,
  currency,
  onCurrencyToggle,
  workspaceId,
}: CreditPackagesGridProps) {
  const [purchasing, setPurchasing] = React.useState<string | null>(null);

  const handlePurchase = async (pkg: CreditPackage) => {
    setPurchasing(pkg.id);
    try {
      const session = await billingApi.initiateCreditTopUp(pkg.id, currency);
      window.open(session.checkout_url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setPurchasing(null);
    }
  };

  const isNGN = currency === "NGN";

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Buy More Credits</h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Credits never expire and stack with your plan.
          </p>
        </div>
        <button
          onClick={onCurrencyToggle}
          className="text-xs text-slate-400 hover:text-violet-300 transition-colors underline underline-offset-2"
        >
          Prices in {isNGN ? "NGN 🇳🇬" : "USD"} &middot; Switch to {isNGN ? "USD" : "NGN 🇳🇬"}
        </button>
      </div>

      {/* Package cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {packages.map((pkg) => (
          <Card
            key={pkg.id}
            className={cn(
              "relative overflow-hidden transition-all duration-200 hover:border-violet-600/70 hover:shadow-lg hover:shadow-violet-900/20",
              pkg.best_value
                ? "border-violet-600/60 bg-gradient-to-br from-violet-950/50 to-slate-900"
                : "border-slate-700/50 bg-slate-900/60"
            )}
          >
            {pkg.best_value && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-violet-600 text-white text-xs px-2 py-0.5 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-white" />
                  Best Value
                </Badge>
              </div>
            )}
            <CardContent className="p-5">
              <div className="mb-4">
                <div className="h-9 w-9 rounded-lg bg-violet-600/20 flex items-center justify-center mb-3">
                  <Package className="h-5 w-5 text-violet-400" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {pkg.credits.toLocaleString()}
                </p>
                <p className="text-sm text-slate-400">credits</p>
              </div>

              <Separator className="bg-slate-700/50 mb-4" />

              <div className="mb-4">
                <p className="text-xl font-semibold text-white">
                  {pkg.display_price}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isNGN
                    ? `≈ $${pkg.price_usd} USD`
                    : `${(pkg.price_usd / pkg.credits * 100).toFixed(2)}¢ per credit`}
                </p>
              </div>

              <Button
                className={cn(
                  "w-full text-sm h-9",
                  pkg.best_value
                    ? "bg-violet-600 hover:bg-violet-700 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600/60"
                )}
                onClick={() => handlePurchase(pkg)}
                disabled={purchasing === pkg.id}
              >
                {purchasing === pkg.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : isNGN ? (
                  "🇳🇬 Pay with Paystack"
                ) : (
                  <>
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Pay with Card
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Plan & Subscription tab ──────────────────────────────────────────────────

interface PlanTabProps {
  subscription: {
    planName: string;
    plan: string;
    status: string;
    renewalDate: string;
    used: { accounts: number; posts: number; aiCredits: number };
    limits: { accounts: number; posts: number; aiCredits: number };
  };
  onPortalClick: () => void;
  onUpgradeClick: () => void;
  portalLoading: boolean;
  upgradeLoading: boolean;
}

function PlanTab({ subscription, onPortalClick, onUpgradeClick, portalLoading, upgradeLoading }: PlanTabProps) {
  const isFreePlan = subscription.plan.toLowerCase() === "free";
  // Build dynamic "What's included" list from actual plan limits
  const planFeatures = React.useMemo(() => {
    const { accounts, posts, aiCredits } = subscription.limits;
    const plan = subscription.plan.toLowerCase();
    const features: string[] = [
      accounts >= 999 ? "Unlimited social accounts" : `Up to ${accounts} social accounts`,
      aiCredits >= 28000
        ? `${aiCredits.toLocaleString()} AI credits/month`
        : aiCredits >= 1000
        ? `${aiCredits.toLocaleString()} plan AI credits/month`
        : `${aiCredits} plan AI credits/month`,
      posts >= 9999 ? "Unlimited scheduled posts" : `Up to ${posts.toLocaleString()} posts/month`,
      "Analytics & reporting",
      "Content calendar",
      "AI caption & image generation",
    ];
    if (plan === "agency") {
      features.push("White-label workspace");
      features.push("Media library (10 GB)");
      features.push("Priority support");
    } else if (plan === "pro") {
      features.push("5 workspaces");
      features.push("Media library (5 GB)");
      features.push("Priority support");
    } else if (plan === "starter") {
      features.push("Media library (5 GB)");
      features.push("Email support");
    } else {
      features.push("Media library (1 GB)");
      features.push("Community support");
    }
    return features;
  }, [subscription.plan, subscription.limits]);

  const acctPct = subscription.limits.accounts > 0
    ? Math.round((subscription.used.accounts / subscription.limits.accounts) * 100)
    : 0;
  const postsPct = subscription.limits.posts > 0
    ? Math.round((subscription.used.posts / subscription.limits.posts) * 100)
    : 0;
  const aiPct = subscription.limits.aiCredits > 0
    ? Math.round((subscription.used.aiCredits / subscription.limits.aiCredits) * 100)
    : 0;

  const usageItems = [
    {
      label: "Social Accounts",
      used: subscription.used.accounts,
      limit: subscription.limits.accounts,
      pct: acctPct,
    },
    {
      label: "Scheduled Posts",
      used: subscription.used.posts,
      limit: subscription.limits.posts,
      pct: postsPct,
    },
    {
      label: "Plan AI Credits",
      used: subscription.used.aiCredits,
      limit: subscription.limits.aiCredits,
      pct: aiPct,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Current plan card */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base text-white flex items-center gap-2">
                {subscription.planName} Plan
                <Badge
                  className={cn(
                    "text-xs px-2 py-0.5",
                    subscription.status === "active"
                      ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/40"
                      : "bg-amber-900/40 text-amber-400 border-amber-700/40"
                  )}
                >
                  {subscription.status === "active" ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  )}
                  {subscription.status === "active" ? "Active" : subscription.status}
                </Badge>
              </CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                Renews on {subscription.renewalDate}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isFreePlan && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white text-xs"
                  onClick={onPortalClick}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Manage in Stripe
                </Button>
              )}
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
                onClick={onUpgradeClick}
                disabled={upgradeLoading}
              >
                {upgradeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                )}
                {isFreePlan ? "Upgrade Plan" : "Change Plan"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <Separator className="bg-slate-700/50" />
        <CardContent className="pt-4 space-y-4">
          {usageItems.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-300">{item.label}</span>
                <span className="text-sm text-slate-400">
                  {item.used.toLocaleString()} / {item.limit.toLocaleString()}
                </span>
              </div>
              <Progress
                value={item.pct}
                className={cn(
                  "h-2 bg-slate-700",
                  item.pct >= 90 && "[&>div]:bg-rose-500",
                  item.pct >= 70 && item.pct < 90 && "[&>div]:bg-amber-500"
                )}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feature highlights */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="p-5">
          <p className="text-sm font-medium text-white mb-4">
            What&apos;s included in your plan
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {planFeatures.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Transaction History tab ──────────────────────────────────────────────────

interface TransactionHistoryTabProps {
  entries: CreditLedgerEntry[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}

function TransactionHistoryTab({
  entries,
  total,
  page,
  onPageChange,
}: TransactionHistoryTabProps) {
  const totalPages = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
          <History className="h-7 w-7 text-slate-500" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">No transactions yet</h3>
        <p className="text-sm text-slate-500">
          Your credit history will appear here once you top up or use AI features.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-transparent">
                <TableHead className="text-slate-400 pl-5">Type</TableHead>
                <TableHead className="text-slate-400">Credits</TableHead>
                <TableHead className="text-slate-400">Balance After</TableHead>
                <TableHead className="text-slate-400 hidden md:table-cell">Amount</TableHead>
                <TableHead className="text-slate-400 hidden lg:table-cell">Provider</TableHead>
                <TableHead className="text-slate-400 text-right pr-5">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const typeConfig = entryTypeConfig[entry.entry_type];
                const isCredit = entry.credits > 0;

                return (
                  <TableRow
                    key={entry.id}
                    className="border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                  >
                    <TableCell className="pl-5 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
                          typeConfig.bgClass
                        )}
                      >
                        {isCredit ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {typeConfig.label}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          isCredit ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {isCredit ? "+" : ""}
                        {entry.credits.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="text-sm text-slate-300 tabular-nums">
                        {entry.balance_after.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 hidden md:table-cell">
                      {entry.usd_amount !== undefined && entry.usd_amount !== 0 ? (
                        <span className="text-sm text-slate-400">
                          ${entry.usd_amount.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 hidden lg:table-cell">
                      <ProviderIcon provider={entry.provider} />
                    </TableCell>
                    <TableCell className="py-3.5 text-right pr-5">
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-slate-400">
                          {formatRelativeDate(entry.created_at)}
                        </span>
                        <span className="text-xs text-slate-600 hidden sm:block">
                          {formatDate(entry.created_at).split(",").slice(0, 1)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} &middot; {total} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 h-8 w-8 p-0"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 h-8 w-8 p-0"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "ws_default";

  // Currency toggle — set by IP detection from first API response, then manually overrideable
  const [currency, setCurrency] = React.useState<Currency>("USD");

  // Packages state — loaded from API; empty until first fetch completes
  const [packages, setPackages] = React.useState<CreditPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = React.useState(true);

  // Balance state (fetched from API, fallback to zeros)
  const [balance, setBalance] = React.useState<CreditBalance>(ZERO_BALANCE);
  const [balanceLoading, setBalanceLoading] = React.useState(true);

  // Ledger state (fetched from API)
  const [allLedger, setAllLedger] = React.useState<CreditLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = React.useState(true);
  const [ledgerPage, setLedgerPage] = React.useState(1);
  const ledgerSlice = allLedger.slice(
    (ledgerPage - 1) * LEDGER_PAGE_SIZE,
    ledgerPage * LEDGER_PAGE_SIZE,
  );

  // Usage state (fetched from API)
  const [usage, setUsage] = React.useState<BillingUsage | null>(null);

  // Portal loading
  const [portalLoading, setPortalLoading] = React.useState(false);

  const subscription = {
    planName: workspace?.plan
      ? workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1)
      : "Free",
    plan: workspace?.plan ?? "free",
    status: "active",
    renewalDate: "—",
    used: {
      accounts:  usage?.socialAccountsUsed   ?? 0,
      posts:     usage?.scheduledPostsUsed   ?? 0,
      aiCredits: usage?.aiCreditsUsed        ?? balance.plan_credits_used,
    },
    limits: {
      accounts:  usage?.socialAccountsLimit  ?? 0,
      posts:     usage?.scheduledPostsLimit  ?? 0,
      aiCredits: usage?.aiCreditsLimit       ?? balance.plan_credits_limit,
    },
  };

  // Fetch packages whenever the currency changes (covers initial load + manual toggle)
  React.useEffect(() => {
    setPackagesLoading(true);
    billingApi
      .getCreditPackages(currency)
      .then((res) => {
        if (res.packages?.length) {
          setPackages(res.packages);
          // Honour the server-detected currency on the first load (before any manual toggle)
          if (packages.length === 0 && res.currency) {
            setCurrency(res.currency as Currency);
          }
        }
      })
      .catch(() => { /* keep existing packages on error */ })
      .finally(() => setPackagesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // Load balance, ledger and usage on mount
  React.useEffect(() => {

    // Credit balance
    billingApi
      .getCreditBalance()
      .then((res) => { if (res.data) setBalance(res.data); })
      .catch(() => { /* keep fallback zeros */ })
      .finally(() => setBalanceLoading(false));

    // Transaction ledger (fetch up to 200 entries for client-side pagination)
    billingApi
      .getCreditLedger({ limit: 200, offset: 0 })
      .then((res) => { if (res.data) setAllLedger(res.data); })
      .catch(() => { /* show empty state */ })
      .finally(() => setLedgerLoading(false));

    // Usage / subscription — backend returns snake_case; normalise here.
    billingApi
      .getWorkspaceUsage()
      .then((res) => {
        if (res.data) {
          const d = res.data as any;
          setUsage({
            ...res.data,
            socialAccountsUsed:  d.socialAccountsUsed  ?? d.accounts_connected ?? 0,
            socialAccountsLimit: d.socialAccountsLimit ?? d.accounts_max        ?? 0,
            scheduledPostsUsed:  d.scheduledPostsUsed  ?? d.posts_this_month    ?? 0,
            scheduledPostsLimit: d.scheduledPostsLimit ?? d.posts_limit         ?? 0,
            aiCreditsUsed:       d.aiCreditsUsed       ?? d.credits_used        ?? 0,
            aiCreditsLimit:      d.aiCreditsLimit      ?? d.credits_total       ?? 0,
            workspaceId:         d.workspaceId         ?? d.workspace_id        ?? "",
            period:              d.period              ?? "",
            teamMembersUsed:     d.teamMembersUsed     ?? d.team_members_used   ?? 0,
            teamMembersLimit:    d.teamMembersLimit    ?? d.team_members_limit  ?? 0,
          });
        }
      })
      .catch(() => { /* keep null */ });
  }, [workspaceId]);

  const handleCurrencyToggle = () => {
    setCurrency((prev) => (prev === "USD" ? "NGN" : "USD"));
  };

  // Always use API-loaded packages; an empty array shows a loading skeleton.
  const displayPackages = packages;

  const handlePortalClick = async () => {
    setPortalLoading(true);
    try {
      const res = await billingApi.getPortalUrl();
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const [planPickerOpen, setPlanPickerOpen] = React.useState(false);
  const [upgradeLoading, setUpgradeLoading] = React.useState(false);

  const handleUpgradeClick = () => setPlanPickerOpen(true);

  const handleSelectPlan = async (planType: "starter" | "pro" | "agency", interval: "monthly" | "yearly") => {
    setUpgradeLoading(true);
    try {
      const res = await billingApi.createSubscription({ planType, interval });
      const url = (res.data as { checkout_url?: string; checkoutUrl?: string }).checkout_url
        ?? (res.data as { checkoutUrl?: string }).checkoutUrl;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Checkout URL not returned. Please try again.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start checkout";
      toast.error(msg.includes("STRIPE_NOT_CONFIGURED")
        ? "Plan upgrades aren't configured yet. Please contact support to subscribe."
        : msg);
    } finally {
      setUpgradeLoading(false);
      setPlanPickerOpen(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-white">Billing & Credits</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Manage your subscription, top up AI credits, and view transaction history.
        </p>
      </div>

      <Tabs defaultValue="plan" className="space-y-6">
        <TabsList className="bg-slate-800/60 border border-slate-700/50 p-1 h-auto">
          <TabsTrigger
            value="plan"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-colors px-4 py-2 text-sm rounded-md"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Plan &amp; Subscription
          </TabsTrigger>
          <TabsTrigger
            value="credits"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-colors px-4 py-2 text-sm rounded-md"
          >
            <Zap className="h-4 w-4 mr-2" />
            AI Credits
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-colors px-4 py-2 text-sm rounded-md"
          >
            <History className="h-4 w-4 mr-2" />
            Transaction History
          </TabsTrigger>
        </TabsList>

        {/* Plan & Subscription */}
        <TabsContent value="plan" className="mt-0">
          <PlanTab
            subscription={subscription}
            onPortalClick={handlePortalClick}
            onUpgradeClick={handleUpgradeClick}
            portalLoading={portalLoading}
            upgradeLoading={upgradeLoading}
          />
        </TabsContent>

        <PlanPickerDialog
          open={planPickerOpen}
          onOpenChange={setPlanPickerOpen}
          currentPlan={subscription.plan}
          onSelect={handleSelectPlan}
          loading={upgradeLoading}
        />


        {/* AI Credits */}
        <TabsContent value="credits" className="mt-0 space-y-6">
          {/* Balance summary */}
          {balanceLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl bg-slate-800" />
              ))}
            </div>
          ) : (
            <CreditBalanceCard balance={balance} />
          )}

          {/* Credit packages */}
          {packagesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl bg-slate-800" />
              ))}
            </div>
          ) : (
            <CreditPackagesGrid
              packages={displayPackages}
              currency={currency}
              onCurrencyToggle={handleCurrencyToggle}
              workspaceId={workspaceId}
            />
          )}

          {/* Info banner */}
          <Card className="bg-slate-800/40 border-slate-700/40">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">
                  How AI credits work
                </p>
                <p className="text-sm text-slate-400 mt-0.5 leading-relaxed">
                  Each AI generation (caption, image, repurpose, etc.) deducts credits from your balance.
                  Purchased credits never expire and are used first, followed by your monthly plan credits.
                  Credits are shared across all workspaces on your account.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transaction History */}
        <TabsContent value="history" className="mt-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Transaction History</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                All credit movements and purchases on your account.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white text-xs"
              disabled={ledgerLoading}
              onClick={() => {
                setLedgerLoading(true);
                billingApi
                  .getCreditLedger({ limit: 200, offset: 0 })
                  .then((res) => { if (res.data) setAllLedger(res.data); })
                  .catch(() => toast.error("Failed to refresh transactions"))
                  .finally(() => setLedgerLoading(false));
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${ledgerLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {ledgerLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg bg-slate-800" />
              ))}
            </div>
          ) : (
            <TransactionHistoryTab
              entries={ledgerSlice}
              total={allLedger.length}
              page={ledgerPage}
              onPageChange={setLedgerPage}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PLAN PICKER DIALOG
// ══════════════════════════════════════════════════════════════════════════

interface PlanPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  onSelect: (planType: "starter" | "pro" | "agency", interval: "monthly" | "yearly") => void;
  loading: boolean;
}

function PlanPickerDialog({ open, onOpenChange, currentPlan, onSelect, loading }: PlanPickerDialogProps) {
  const [interval, setInterval] = React.useState<"monthly" | "yearly">("monthly");

  if (!open) return null;

  const plans: Array<{ id: "starter" | "pro" | "agency"; name: string; monthly: number; yearly: number; features: string[]; popular?: boolean }> = [
    { id: "starter", name: "Starter", monthly: 29, yearly: 290, features: ["20 social accounts", "500 posts/mo", "1,250 AI credits/mo"] },
    { id: "pro", name: "Pro", monthly: 79, yearly: 790, features: ["40 social accounts", "Unlimited posts", "5,000 AI credits/mo", "5 team members"], popular: true },
    { id: "agency", name: "Agency", monthly: 199, yearly: 1990, features: ["Unlimited social accounts", "Unlimited posts", "28,000 AI credits/mo", "White-label", "Unlimited team"] },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !loading && onOpenChange(false)}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Choose your plan</h2>
            <p className="text-sm text-slate-400 mt-0.5">Upgrade any time. Cancel any time.</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-white" disabled={loading}>✕</button>
        </div>

        <div className="flex gap-2 mb-6 bg-slate-800 rounded-lg p-1 w-fit">
          {(["monthly", "yearly"] as const).map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={cn(
                "px-4 py-1.5 text-sm rounded-md transition-colors",
                interval === iv ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              {iv === "monthly" ? "Monthly" : "Yearly (save 17%)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = currentPlan.toLowerCase() === p.id;
            const price = interval === "monthly" ? p.monthly : p.yearly;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-xl border p-5 relative",
                  p.popular ? "border-violet-500 bg-violet-950/20" : "border-slate-700 bg-slate-800/50"
                )}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold text-white">${price}</span>
                  <span className="text-sm text-slate-400">/{interval === "monthly" ? "mo" : "yr"}</span>
                </div>
                <ul className="space-y-2 mb-5">
                  {p.features.map((f) => (
                    <li key={f} className="text-sm text-slate-300 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={cn(
                    "w-full",
                    isCurrent ? "bg-slate-700 cursor-default" : p.popular ? "bg-violet-600 hover:bg-violet-700" : "bg-slate-700 hover:bg-slate-600"
                  )}
                  onClick={() => !isCurrent && onSelect(p.id, interval)}
                  disabled={isCurrent || loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? "Current Plan" : `Upgrade to ${p.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          Powered by Stripe · Cancel from your account anytime
        </p>
      </div>
    </div>
  );
}
