"use client";

import * as React from "react";
import {
  Settings, Key, Shield, Wrench, Save, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Trash2, RefreshCw,
  AlertCircle, ToggleLeft, ToggleRight, Gift, Search, X, Plus,
  Zap, DollarSign, Package, Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";

type TabId = "general" | "integrations" | "security" | "ai-costs" | "maintenance";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "integrations", label: "Integrations", icon: Key },
  { id: "security", label: "Security", icon: Shield },
  { id: "ai-costs", label: "AI Costs", icon: Zap },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
];

// ── AI cost config types ────────────────────────────────────────────────────
type AIJobCostRow = {
  id: string;
  label: string;
  jobType: string;
  usdCost: string;
  credits: string;
  description: string;
};

type CreditPackageRow = {
  id: string;
  label: string;
  credits: string;
  usdPrice: string;
  ngnPrice: string;
  bestValue: boolean;
};

const DEFAULT_AI_COSTS: AIJobCostRow[] = [
  { id: "caption",   label: "Caption Generation",  jobType: "caption",   usdCost: "0.005", credits: "1",  description: "GPT-4o prompt + completion" },
  { id: "hashtags",  label: "Hashtag Generation",  jobType: "hashtags",  usdCost: "0.003", credits: "1",  description: "GPT-4o short completion" },
  { id: "carousel",  label: "Carousel Copy",        jobType: "carousel",  usdCost: "0.010", credits: "2",  description: "Multi-slide caption set" },
  { id: "analyse",   label: "Viral Analysis",       jobType: "analyse",   usdCost: "0.005", credits: "1",  description: "Engagement scoring prompt" },
  { id: "repurpose", label: "Repurpose Content",    jobType: "repurpose", usdCost: "0.015", credits: "3",  description: "8-platform repurpose (8× prompts)" },
  { id: "improve",   label: "Improve Caption",      jobType: "improve",   usdCost: "0.004", credits: "1",  description: "Rewrite / tone-adjust" },
  { id: "image",     label: "AI Image",             jobType: "image",     usdCost: "0.030", credits: "5",  description: "FLUX schnell on Fal.ai" },
  { id: "video",     label: "AI Video",             jobType: "video",     usdCost: "0.200", credits: "20", description: "Kling / Seedance on Fal.ai" },
];

const DEFAULT_PACKAGES: CreditPackageRow[] = [
  { id: "credits_100",  label: "Starter Pack",   credits: "100",  usdPrice: "5",   ngnPrice: "8000",   bestValue: false },
  { id: "credits_500",  label: "Growth Pack",    credits: "500",  usdPrice: "20",  ngnPrice: "32000",  bestValue: false },
  { id: "credits_1500", label: "Pro Pack",       credits: "1500", usdPrice: "50",  ngnPrice: "80000",  bestValue: true  },
  { id: "credits_5000", label: "Agency Pack",    credits: "5000", usdPrice: "150", ngnPrice: "240000", bestValue: false },
];

function SaveButton({ onClick }: { onClick: () => void }) {
  const [saved, setSaved] = React.useState(false);
  const handleClick = () => {
    onClick();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
        saved
          ? "bg-emerald-600 text-white"
          : "bg-violet-600 hover:bg-violet-700 text-white"
      )}
    >
      {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
      {saved ? "Saved!" : "Save Changes"}
    </button>
  );
}

function MaskedField({ label, value, status }: { label: string; value: string; status: "ok" | "warn" }) {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs font-mono text-slate-500 mt-0.5">
          {revealed ? value : value.slice(0, 6) + "•".repeat(22) + value.slice(-4)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {status === "ok" ? (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Not set
          </span>
        )}
        <button
          onClick={() => setRevealed(!revealed)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors"
        >
          {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {revealed ? "Hide" : "Reveal"}
        </button>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn("transition-colors", checked ? "text-violet-400" : "text-slate-600")}
    >
      {checked ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
    </button>
  );
}

type FreeGrant = {
  id: string;
  email: string;
  name: string;
  plan: string;
  expiresAt: string;
  grantedAt: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<TabId>("general");

  // General state
  const [appName, setAppName] = React.useState("ChiselPost");
  const [supportEmail, setSupportEmail] = React.useState("support@ChiselPost.io");
  const [defaultPlan, setDefaultPlan] = React.useState("free");
  const [maxAccountsFree, setMaxAccountsFree] = React.useState("2");
  const [maxAccountsStarter, setMaxAccountsStarter] = React.useState("5");
  const [maxAccountsPro, setMaxAccountsPro] = React.useState("15");
  const [maxAccountsAgency, setMaxAccountsAgency] = React.useState("50");

  // AI Costs state
  const [aiCosts, setAiCosts] = React.useState<AIJobCostRow[]>(DEFAULT_AI_COSTS);
  const [packages, setPackages] = React.useState<CreditPackageRow[]>(DEFAULT_PACKAGES);
  const [ngnRate, setNgnRate] = React.useState("1600");
  const [editingCostId, setEditingCostId] = React.useState<string | null>(null);
  const [editingPkgId, setEditingPkgId] = React.useState<string | null>(null);
  const [costSaving, setCostSaving] = React.useState(false);

  const handleSaveGeneral = async () => {
    try {
      await Promise.all([
        adminApi.updatePlatformSetting("app_name", appName),
        adminApi.updatePlatformSetting("support_email", supportEmail),
        adminApi.updatePlatformSetting("default_plan", defaultPlan),
        adminApi.updatePlatformSetting("max_accounts_free", maxAccountsFree),
        adminApi.updatePlatformSetting("max_accounts_starter", maxAccountsStarter),
        adminApi.updatePlatformSetting("max_accounts_pro", maxAccountsPro),
        adminApi.updatePlatformSetting("max_accounts_agency", maxAccountsAgency),
      ]);
      toast.success("General settings saved");
    } catch {
      toast.error("Failed to save general settings");
    }
  };

  const handleSaveSecurity = async () => {
    try {
      await Promise.all([
        adminApi.updatePlatformSetting("session_timeout", sessionTimeout),
        adminApi.updatePlatformSetting("max_login_attempts", maxLoginAttempts),
        adminApi.updatePlatformSetting("enforce_2fa", String(enforce2FA)),
        adminApi.updatePlatformSetting("ip_allowlist", ipAllowlist),
      ]);
      toast.success("Security settings saved");
    } catch {
      toast.error("Failed to save security settings");
    }
  };

  const handleToggleMaintenance = async () => {
    const newVal = !maintenanceMode;
    setMaintenanceMode(newVal);
    try {
      await adminApi.updatePlatformSetting("maintenance_mode", String(newVal));
      toast.success(newVal ? "Maintenance mode enabled" : "Maintenance mode disabled");
    } catch {
      setMaintenanceMode(!newVal);
      toast.error("Failed to toggle maintenance mode");
    }
  };

  const handleSaveCosts = async () => {
    setCostSaving(true);
    try {
      await adminApi.bulkUpdateAiJobCosts(
        aiCosts.map((r) => ({
          job_type: r.jobType,
          credits: parseInt(r.credits) || 0,
          usd_cost: parseFloat(r.usdCost) || 0,
        })),
      );
      toast.success("AI costs updated");
    } catch {
      toast.error("Failed to save AI costs");
    } finally {
      setCostSaving(false);
    }
  };

  const updateCost = (id: string, field: keyof AIJobCostRow, value: string) =>
    setAiCosts((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const updatePkg = (id: string, field: keyof CreditPackageRow, value: string | boolean) =>
    setPackages((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  // Free access grant state
  const [grantEmail, setGrantEmail] = React.useState("");
  const [grantPlan, setGrantPlan] = React.useState("pro");
  const [grantDuration, setGrantDuration] = React.useState("14");
  const [grantCustomDays, setGrantCustomDays] = React.useState("");
  const [grantSubmitting, setGrantSubmitting] = React.useState(false);
  const [grantSuccess, setGrantSuccess] = React.useState(false);
  const [activeGrants, setActiveGrants] = React.useState<FreeGrant[]>([]);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  // Security state
  const [sessionTimeout, setSessionTimeout] = React.useState("30");
  const [maxLoginAttempts, setMaxLoginAttempts] = React.useState("5");
  const [enforce2FA, setEnforce2FA] = React.useState(false);
  const [ipAllowlist, setIpAllowlist] = React.useState("");

  // Integrations state
  const [integrations, setIntegrations] = React.useState<
    Array<{ key: string; label: string; configured: boolean; masked: string; updated_at: string | null }>
  >([]);
  const [editingIntKey, setEditingIntKey] = React.useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = React.useState("");
  const [keySaving, setKeySaving] = React.useState(false);

  // Maintenance state
  const [maintenanceMode, setMaintenanceMode] = React.useState(false);
  const [confirmClearCache, setConfirmClearCache] = React.useState(false);
  const [confirmMigrations, setConfirmMigrations] = React.useState(false);
  const [cacheClearing, setCacheClearing] = React.useState(false);
  const [migrationsRunning, setMigrationsRunning] = React.useState(false);

  const handleGrantAccess = async () => {
    if (!grantEmail) return;
    setGrantSubmitting(true);
    try {
      const days = grantDuration === "custom" ? parseInt(grantCustomDays) || 30 : parseInt(grantDuration);
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      await adminApi.grantPlan({
        userId: grantEmail, // backend resolves by email
        planType: grantPlan,
        expiresAt,
      });
      const newGrant: FreeGrant = {
        id: String(Date.now()),
        email: grantEmail,
        name: grantEmail.split("@")[0],
        plan: grantPlan.charAt(0).toUpperCase() + grantPlan.slice(1),
        expiresAt: expiresAt.slice(0, 10),
        grantedAt: new Date().toISOString().slice(0, 10),
      };
      setActiveGrants((prev) => [newGrant, ...prev]);
      setGrantSuccess(true);
      setGrantEmail("");
      toast.success(`Plan granted to ${grantEmail}`);
      setTimeout(() => setGrantSuccess(false), 3000);
    } catch {
      toast.error("Failed to grant plan access");
    } finally {
      setGrantSubmitting(false);
    }
  };

  const handleRevokeGrant = async (id: string) => {
    const grant = activeGrants.find((g) => g.id === id);
    if (!grant) return;
    setRevoking(id);
    try {
      // Revert to free plan — use email as the identifier
      await adminApi.grantPlan({ userId: grant.email, planType: "free" });
      setActiveGrants((prev) => prev.filter((g) => g.id !== id));
      toast.success(`Plan revoked for ${grant.email}`);
    } catch {
      toast.error("Failed to revoke plan access");
    } finally {
      setRevoking(null);
    }
  };

  const handleClearCache = () => {
    if (!confirmClearCache) { setConfirmClearCache(true); return; }
    // Redis cache clearing is done via the server CLI or a restart.
    // The AI service config cache (60s TTL) resets automatically on next request.
    toast.info("Cache clears automatically within 60 seconds. For a full Redis flush, run: redis-cli FLUSHDB on the server.");
    setConfirmClearCache(false);
  };

  const handleMigrations = () => {
    if (!confirmMigrations) { setConfirmMigrations(true); return; }
    // Migrations run automatically on every server startup via embedded SQL files.
    // Triggering them manually requires a server restart or the migrate CLI command.
    toast.info("Migrations run automatically on server startup. To run them now: restart the server or run `go run ./cmd/migrate`.");
    setConfirmMigrations(false);
  };

  // Load all settings from API on mount
  React.useEffect(() => {
    // Load general + security settings from platform_settings
    adminApi.getPlatformSettings().then((res) => {
      if (res?.data) {
        const s = res.data as Record<string, string>;
        if (s.app_name) setAppName(s.app_name);
        if (s.support_email) setSupportEmail(s.support_email);
        if (s.default_plan) setDefaultPlan(s.default_plan);
        if (s.max_accounts_free) setMaxAccountsFree(s.max_accounts_free);
        if (s.max_accounts_starter) setMaxAccountsStarter(s.max_accounts_starter);
        if (s.max_accounts_pro) setMaxAccountsPro(s.max_accounts_pro);
        if (s.max_accounts_agency) setMaxAccountsAgency(s.max_accounts_agency);
        if (s.session_timeout) setSessionTimeout(s.session_timeout);
        if (s.max_login_attempts) setMaxLoginAttempts(s.max_login_attempts);
        if (s.enforce_2fa) setEnforce2FA(s.enforce_2fa === "true");
        if (s.ip_allowlist) setIpAllowlist(s.ip_allowlist);
        if (s.maintenance_mode) setMaintenanceMode(s.maintenance_mode === "true");
      }
    }).catch(() => {});

    // Load AI costs
    adminApi.getAiJobCosts().then((res) => {
      if (res?.data) {
        setAiCosts(res.data.map((c) => ({
          id: c.job_type,
          label: c.job_type.charAt(0).toUpperCase() + c.job_type.slice(1),
          jobType: c.job_type,
          usdCost: String(c.usd_cost),
          credits: String(c.credits),
          description: c.description || "",
        })));
      }
    }).catch(() => {});
    adminApi.getCreditPackages().then((res) => {
      if (res?.data) {
        setPackages(res.data.map((p) => ({
          id: p.id,
          label: p.label,
          credits: String(p.credits),
          usdPrice: String(p.usd_price),
          ngnPrice: String(p.ngn_price),
          bestValue: p.best_value,
        })));
      }
    }).catch(() => {});
    adminApi.getIntegrationStatus().then((res) => {
      if (res?.data) setIntegrations(res.data);
    }).catch(() => {});
  }, []);

  const inputClass = "w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-600";
  const labelClass = "text-xs font-medium text-slate-400 block mb-1.5";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">System Settings</h2>
        <p className="text-slate-400 text-sm mt-1">Configure global application settings and integrations.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-violet-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* General tab */}
      {activeTab === "general" && (
        <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 max-w-2xl">
          <h3 className="text-sm font-semibold text-white">General Settings</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>App Name</label>
              <input type="text" value={appName} onChange={(e) => setAppName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Support Email</label>
              <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Default Plan for New Users</label>
            <select
              value={defaultPlan}
              onChange={(e) => setDefaultPlan(e.target.value)}
              className={cn(inputClass, "appearance-none")}
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Max Social Accounts per Plan</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Free", value: maxAccountsFree, set: setMaxAccountsFree },
                { label: "Starter", value: maxAccountsStarter, set: setMaxAccountsStarter },
                { label: "Pro", value: maxAccountsPro, set: setMaxAccountsPro },
                { label: "Agency", value: maxAccountsAgency, set: setMaxAccountsAgency },
              ].map((p) => (
                <div key={p.label}>
                  <label className="text-xs text-slate-500 block mb-1">{p.label}</label>
                  <input
                    type="number"
                    value={p.value}
                    onChange={(e) => p.set(e.target.value)}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>

          <SaveButton onClick={handleSaveGeneral} />
        </div>

        {/* ── Grant Free Access ────────────────────────────────── */}
        <div className="bg-slate-900 border border-violet-900/40 rounded-xl p-5 space-y-5 max-w-2xl">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Grant Free Access</h3>
          </div>
          <p className="text-xs text-slate-500 -mt-3">
            Override a user&#39;s plan with free premium access for a fixed period.
          </p>

          {/* Form */}
          <div className="space-y-4">
            {/* Email search */}
            <div>
              <label className={labelClass}>User Email</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="user@example.com"
                  className={cn(inputClass, "pl-9")}
                />
                {grantEmail && (
                  <button
                    onClick={() => setGrantEmail("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Plan selector */}
              <div>
                <label className={labelClass}>Plan to Grant</label>
                <select
                  value={grantPlan}
                  onChange={(e) => setGrantPlan(e.target.value)}
                  className={cn(inputClass, "appearance-none")}
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="agency">Agency</option>
                </select>
              </div>

              {/* Duration selector */}
              <div>
                <label className={labelClass}>Duration</label>
                <select
                  value={grantDuration}
                  onChange={(e) => setGrantDuration(e.target.value)}
                  className={cn(inputClass, "appearance-none")}
                >
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="custom">Custom…</option>
                </select>
              </div>
            </div>

            {/* Custom days input */}
            {grantDuration === "custom" && (
              <div>
                <label className={labelClass}>Custom Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={grantCustomDays}
                  onChange={(e) => setGrantCustomDays(e.target.value)}
                  placeholder="e.g. 45"
                  className={inputClass}
                />
              </div>
            )}

            {grantSuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Free access granted successfully.
              </p>
            )}

            <button
              onClick={handleGrantAccess}
              disabled={!grantEmail || grantSubmitting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Plus className={cn("h-4 w-4", grantSubmitting && "animate-spin")} />
              {grantSubmitting ? "Granting…" : "Grant Access"}
            </button>
          </div>

          {/* Active grants table */}
          {activeGrants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-3">Active Free Grants ({activeGrants.length})</p>
              <div className="rounded-lg border border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-500">
                      <th className="text-left px-3 py-2 font-medium">User</th>
                      <th className="text-left px-3 py-2 font-medium">Plan</th>
                      <th className="text-left px-3 py-2 font-medium">Expires</th>
                      <th className="text-left px-3 py-2 font-medium">Granted</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeGrants.map((grant) => (
                      <tr key={grant.id} className="border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <p className="text-white font-medium">{grant.name}</p>
                          <p className="text-slate-500">{grant.email}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-300 text-xs font-medium">
                            {grant.plan}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{grant.expiresAt}</td>
                        <td className="px-3 py-2.5 text-slate-500">{grant.grantedAt}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => handleRevokeGrant(grant.id)}
                            disabled={revoking === grant.id}
                            className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                            title="Revoke access"
                          >
                            {revoking === grant.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === "integrations" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-2xl space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">AI Service API Keys</h3>
            <p className="text-xs text-slate-500 mb-4">Configure the API keys used for AI content generation. Keys are stored AES-256 encrypted. Changes take effect within 60 seconds.</p>

            {integrations.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Loading integrations...</p>
            ) : (
              <div className="space-y-0 divide-y divide-slate-800/60">
                {integrations.map((int) => (
                  <div key={int.key} className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{int.label}</p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          {int.configured ? int.masked : "Not configured"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {int.configured ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" /> Not set
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingIntKey(editingIntKey === int.key ? null : int.key);
                            setNewKeyValue("");
                          }}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                          {editingIntKey === int.key ? "Cancel" : "Edit"}
                        </button>
                      </div>
                    </div>
                    {editingIntKey === int.key && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="password"
                          value={newKeyValue}
                          onChange={(e) => setNewKeyValue(e.target.value)}
                          placeholder={`Paste your ${int.label} key...`}
                          className={inputClass + " flex-1"}
                          autoFocus
                        />
                        <button
                          disabled={!newKeyValue || keySaving}
                          onClick={async () => {
                            setKeySaving(true);
                            try {
                              await adminApi.updatePlatformSetting(int.key, newKeyValue);
                              toast.success(`${int.label} updated`);
                              setEditingIntKey(null);
                              setNewKeyValue("");
                              // Refresh integration status
                              const res = await adminApi.getIntegrationStatus();
                              if (res?.data) setIntegrations(res.data);
                            } catch {
                              toast.error(`Failed to update ${int.label}`);
                            } finally {
                              setKeySaving(false);
                            }
                          }}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                        >
                          {keySaving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Other Services</h3>
            <p className="text-xs text-slate-500 mb-4">These are configured via environment variables on the server.</p>
            <MaskedField label="Stripe" value="Configured via STRIPE_SECRET_KEY env var" status="ok" />
            <MaskedField label="Redis" value="Configured via REDIS_URL env var" status="ok" />
          </div>
        </div>
      )}

      {/* Security tab */}
      {activeTab === "security" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 max-w-2xl">
          <h3 className="text-sm font-semibold text-white">Security Settings</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Session Timeout (minutes)</label>
              <input
                type="number"
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max Login Attempts</label>
              <input
                type="number"
                value={maxLoginAttempts}
                onChange={(e) => setMaxLoginAttempts(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-slate-800">
            <div>
              <p className="text-sm font-medium text-white">Enforce 2FA for all users</p>
              <p className="text-xs text-slate-500 mt-0.5">Require two-factor authentication on every account.</p>
            </div>
            <ToggleSwitch checked={enforce2FA} onChange={setEnforce2FA} />
          </div>

          <div>
            <label className={labelClass}>IP Allowlist (one IP or CIDR per line)</label>
            <textarea
              rows={4}
              value={ipAllowlist}
              onChange={(e) => setIpAllowlist(e.target.value)}
              placeholder={"198.41.128.0/24\n104.21.0.0/16"}
              className={cn(inputClass, "resize-none")}
            />
            <p className="text-xs text-slate-600 mt-1">Leave empty to allow all IPs. Admin access only.</p>
          </div>

          <SaveButton onClick={handleSaveSecurity} />
        </div>
      )}

      {/* AI Costs tab */}
      {activeTab === "ai-costs" && (
        <div className="space-y-6 max-w-4xl">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-400" /> AI Job Costs
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                USD cost charged to your AI provider account per generation. Changes apply within 5 minutes.
              </p>
            </div>
            <button
              onClick={handleSaveCosts}
              disabled={costSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60"
            >
              {costSaving
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {costSaving ? "Saving…" : "Save All"}
            </button>
          </div>

          {/* Per-job cost table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/60 text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Job Type</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Description</th>
                  <th className="text-left px-4 py-3 font-medium">USD Cost</th>
                  <th className="text-left px-4 py-3 font-medium">Credits</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {aiCosts.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{row.label}</p>
                      <p className="text-xs text-slate-500 font-mono">{row.jobType}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">
                      {row.description}
                    </td>
                    <td className="px-4 py-3">
                      {editingCostId === row.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 text-xs">$</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.usdCost}
                            onChange={(e) => updateCost(row.id, "usdCost", e.target.value)}
                            className="w-24 px-2 py-1 bg-slate-800 border border-violet-600 rounded text-xs text-white focus:outline-none"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span className="text-emerald-400 font-mono text-xs">${row.usdCost}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingCostId === row.id ? (
                        <input
                          type="number"
                          min="1"
                          value={row.credits}
                          onChange={(e) => updateCost(row.id, "credits", e.target.value)}
                          className="w-16 px-2 py-1 bg-slate-800 border border-violet-600 rounded text-xs text-white focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">{row.credits} cr</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingCostId === row.id ? (
                        <button
                          onClick={() => setEditingCostId(null)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 ml-auto"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Done
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingCostId(row.id)}
                          className="text-slate-500 hover:text-white transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* NGN Exchange Rate */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-400" /> NGN Exchange Rate
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Naira per USD used to calculate NGN credit package prices. Update periodically.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-slate-400 text-sm">₦</span>
                <input
                  type="number"
                  value={ngnRate}
                  onChange={(e) => setNgnRate(e.target.value)}
                  className="w-28 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-600"
                />
                <span className="text-slate-500 text-sm">/ $1</span>
              </div>
            </div>
          </div>

          {/* Credit Packages */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Package className="h-4 w-4 text-violet-400" /> Credit Packages
              </h4>
              <p className="text-xs text-slate-500">Prices shown to users on the billing page</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/40 text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Package</th>
                  <th className="text-left px-4 py-3 font-medium">Credits</th>
                  <th className="text-left px-4 py-3 font-medium">USD Price</th>
                  <th className="text-left px-4 py-3 font-medium">NGN Price</th>
                  <th className="text-left px-4 py-3 font-medium">Best Value</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="border-t border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">
                      {editingPkgId === pkg.id ? (
                        <input
                          type="text"
                          value={pkg.label}
                          onChange={(e) => updatePkg(pkg.id, "label", e.target.value)}
                          className="w-32 px-2 py-1 bg-slate-800 border border-violet-600 rounded text-xs text-white focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span className="text-white font-medium">{pkg.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingPkgId === pkg.id ? (
                        <input
                          type="number"
                          value={pkg.credits}
                          onChange={(e) => updatePkg(pkg.id, "credits", e.target.value)}
                          className="w-20 px-2 py-1 bg-slate-800 border border-violet-600 rounded text-xs text-white focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">{parseInt(pkg.credits).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingPkgId === pkg.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 text-xs">$</span>
                          <input
                            type="number"
                            value={pkg.usdPrice}
                            onChange={(e) => updatePkg(pkg.id, "usdPrice", e.target.value)}
                            className="w-20 px-2 py-1 bg-slate-800 border border-violet-600 rounded text-xs text-white focus:outline-none"
                          />
                        </div>
                      ) : (
                        <span className="text-emerald-400 font-mono text-xs">${pkg.usdPrice}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingPkgId === pkg.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 text-xs">₦</span>
                          <input
                            type="number"
                            value={pkg.ngnPrice}
                            onChange={(e) => updatePkg(pkg.id, "ngnPrice", e.target.value)}
                            className="w-24 px-2 py-1 bg-slate-800 border border-violet-600 rounded text-xs text-white focus:outline-none"
                          />
                        </div>
                      ) : (
                        <span className="text-amber-400 font-mono text-xs">₦{parseInt(pkg.ngnPrice).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => updatePkg(pkg.id, "bestValue", !pkg.bestValue)}
                        className={cn("text-xs px-2 py-0.5 rounded-full border transition-colors",
                          pkg.bestValue
                            ? "bg-violet-900/40 text-violet-300 border-violet-700"
                            : "text-slate-600 border-slate-700 hover:text-slate-400"
                        )}
                      >
                        {pkg.bestValue ? "✓ Best Value" : "Set Best Value"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingPkgId === pkg.id ? (
                        <button
                          onClick={() => setEditingPkgId(null)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 ml-auto"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Done
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingPkgId(pkg.id)}
                          className="text-slate-500 hover:text-white transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cost summary */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 font-medium mb-3">Margin preview — at current prices</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {packages.map((pkg) => {
                const cost = aiCosts.reduce((sum, r) => sum + parseFloat(r.usdCost || "0") * parseFloat(r.credits || "1"), 0);
                const revenuePerCredit = parseFloat(pkg.usdPrice || "0") / (parseInt(pkg.credits || "1") || 1);
                const costPerCredit = cost / aiCosts.reduce((s, r) => s + parseInt(r.credits || "1"), 0);
                const margin = revenuePerCredit > 0 ? ((revenuePerCredit - costPerCredit) / revenuePerCredit * 100) : 0;
                return (
                  <div key={pkg.id} className="text-center">
                    <p className="text-xs text-slate-500">{pkg.label}</p>
                    <p className={cn("text-lg font-bold mt-1", margin > 60 ? "text-emerald-400" : margin > 30 ? "text-amber-400" : "text-red-400")}>
                      {margin.toFixed(0)}%
                    </p>
                    <p className="text-xs text-slate-600">est. margin</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-600 mt-3">
              * Margin is approximate. Actual cost depends on model, token count, and image resolution.
            </p>
          </div>

        </div>
      )}

      {/* Maintenance tab */}
      {activeTab === "maintenance" && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">System Maintenance</h3>

            {/* Maintenance mode toggle */}
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-sm font-medium text-white">Maintenance Mode</p>
                <p className="text-xs text-slate-500 mt-0.5">Takes the app offline for all non-admin users.</p>
                {maintenanceMode && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> App is currently in maintenance mode
                  </p>
                )}
              </div>
              <ToggleSwitch checked={maintenanceMode} onChange={handleToggleMaintenance} />
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-slate-900 border border-red-900/40 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </h3>

            {/* Clear Redis cache */}
            <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-800/60">
              <div>
                <p className="text-sm font-medium text-white">Clear Redis Cache</p>
                <p className="text-xs text-slate-500 mt-0.5">Flushes all cached data. May temporarily impact performance.</p>
                {confirmClearCache && (
                  <p className="text-xs text-amber-400 mt-1">Are you sure? Click again to confirm.</p>
                )}
              </div>
              <button
                onClick={handleClearCache}
                disabled={cacheClearing}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex-shrink-0",
                  confirmClearCache
                    ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                )}
              >
                <Trash2 className={cn("h-4 w-4", cacheClearing && "animate-spin")} />
                {cacheClearing ? "Clearing…" : confirmClearCache ? "Confirm Clear" : "Clear Cache"}
              </button>
            </div>

            {/* Re-run migrations */}
            <div className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">Re-run Database Migrations</p>
                <p className="text-xs text-slate-500 mt-0.5">Applies any pending schema migrations. Use with caution.</p>
                {confirmMigrations && (
                  <p className="text-xs text-amber-400 mt-1">This may cause downtime. Click again to confirm.</p>
                )}
              </div>
              <button
                onClick={handleMigrations}
                disabled={migrationsRunning}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex-shrink-0",
                  confirmMigrations
                    ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                )}
              >
                <RefreshCw className={cn("h-4 w-4", migrationsRunning && "animate-spin")} />
                {migrationsRunning ? "Running…" : confirmMigrations ? "Confirm Run" : "Run Migrations"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
