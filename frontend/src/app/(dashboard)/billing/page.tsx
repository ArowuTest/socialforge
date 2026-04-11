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

// ── Constants & mock data ────────────────────────────────────────────────────

const ZERO_BALANCE: CreditBalance = {
  credit_balance: 0,
  plan_credits_used: 0,
  plan_credits_limit: 0,
  monthly_usd_cost: 0,
};

const USD_PACKAGES: CreditPackage[] = [
  { id: "pkg_100_usd", credits: 100, price_usd: 4.99, display_price: "$4.99", currency: "USD" },
  { id: "pkg_250_usd", credits: 250, price_usd: 9.99, display_price: "$9.99", currency: "USD" },
  { id: "pkg_600_usd", credits: 600, price_usd: 19.99, display_price: "$19.99", currency: "USD", best_value: true },
  { id: "pkg_1500_usd", credits: 1500, price_usd: 39.99, display_price: "$39.99", currency: "USD" },
];

const NGN_PACKAGES: CreditPackage[] = [
  { id: "pkg_100_ngn", credits: 100, price_usd: 4.99, display_price: "₦7,500", currency: "NGN" },
  { id: "pkg_250_ngn", credits: 250, price_usd: 9.99, display_price: "₦15,000", currency: "NGN" },
  { id: "pkg_600_ngn", credits: 600, price_usd: 19.99, display_price: "₦30,000", currency: "NGN", best_value: true },
  { id: "pkg_1500_ngn", credits: 1500, price_usd: 39.99, display_price: "₦60,000", currency: "NGN" },
];

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
      const session = await billingApi.initiateCreditTopUp(pkg.id);
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
    status: string;
    renewalDate: string;
    used: { accounts: number; posts: number; aiCredits: number };
    limits: { accounts: number; posts: number; aiCredits: number };
  };
  onPortalClick: () => void;
  portalLoading: boolean;
}

function PlanTab({ subscription, onPortalClick, portalLoading }: PlanTabProps) {
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
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
                onClick={() => window.open("/pricing", "_blank")}
              >
                <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                Upgrade Plan
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
            {[
              "Up to 10 social accounts",
              "500 plan AI credits/month",
              "Unlimited scheduled posts",
              "Analytics & reporting",
              "Content calendar",
              "AI caption generation",
              "Media library (5 GB)",
              "Priority email support",
            ].map((feature) => (
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

  // Currency toggle
  const [currency, setCurrency] = React.useState<Currency>("USD");

  // Packages state
  const [packages, setPackages] = React.useState<CreditPackage[]>(USD_PACKAGES);
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

  // Load all data on mount
  React.useEffect(() => {
    // Credit packages
    billingApi
      .getCreditPackages()
      .then((res) => {
        if (res.packages?.length) {
          setPackages(res.packages);
          if (res.currency === "NGN") setCurrency("NGN");
        }
      })
      .catch(() => { /* fall back to local constants */ })
      .finally(() => setPackagesLoading(false));

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

    // Usage / subscription
    billingApi
      .getWorkspaceUsage()
      .then((res) => { if (res.data) setUsage(res.data); })
      .catch(() => { /* keep null */ });
  }, [workspaceId]);

  const handleCurrencyToggle = () => {
    setCurrency((prev) => (prev === "USD" ? "NGN" : "USD"));
  };

  // Use API-loaded packages when available; otherwise fall back to local constants
  // so the currency toggle still works before the API responds.
  const apiPackagesLoaded = packages !== USD_PACKAGES && packages !== NGN_PACKAGES;
  const displayPackages = apiPackagesLoaded
    ? packages
    : currency === "NGN"
    ? NGN_PACKAGES
    : USD_PACKAGES;

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
            portalLoading={portalLoading}
          />
        </TabsContent>

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
