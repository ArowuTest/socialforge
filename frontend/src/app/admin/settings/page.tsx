"use client";

import * as React from "react";
import {
  Settings, Key, Shield, Wrench, Save, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Trash2, RefreshCw,
  AlertCircle, ToggleLeft, ToggleRight, Gift, Search, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "general" | "integrations" | "security" | "maintenance";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "integrations", label: "Integrations", icon: Key },
  { id: "security", label: "Security", icon: Shield },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
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

const MOCK_GRANTS: FreeGrant[] = [
  { id: "1", email: "alice@startup.io", name: "Alice Martin", plan: "Pro", expiresAt: "2026-04-20", grantedAt: "2026-04-06" },
  { id: "2", email: "bob@agency.co", name: "Bob Chen", plan: "Agency", expiresAt: "2026-05-06", grantedAt: "2026-04-06" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<TabId>("general");

  // General state
  const [appName, setAppName] = React.useState("SocialForge");
  const [supportEmail, setSupportEmail] = React.useState("support@socialforge.io");
  const [defaultPlan, setDefaultPlan] = React.useState("free");
  const [maxAccountsFree, setMaxAccountsFree] = React.useState("2");
  const [maxAccountsStarter, setMaxAccountsStarter] = React.useState("5");
  const [maxAccountsPro, setMaxAccountsPro] = React.useState("15");
  const [maxAccountsAgency, setMaxAccountsAgency] = React.useState("50");

  // Free access grant state
  const [grantEmail, setGrantEmail] = React.useState("");
  const [grantPlan, setGrantPlan] = React.useState("pro");
  const [grantDuration, setGrantDuration] = React.useState("14");
  const [grantCustomDays, setGrantCustomDays] = React.useState("");
  const [grantSubmitting, setGrantSubmitting] = React.useState(false);
  const [grantSuccess, setGrantSuccess] = React.useState(false);
  const [activeGrants, setActiveGrants] = React.useState<FreeGrant[]>(MOCK_GRANTS);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  // Security state
  const [sessionTimeout, setSessionTimeout] = React.useState("30");
  const [maxLoginAttempts, setMaxLoginAttempts] = React.useState("5");
  const [enforce2FA, setEnforce2FA] = React.useState(false);
  const [ipAllowlist, setIpAllowlist] = React.useState("");

  // Maintenance state
  const [maintenanceMode, setMaintenanceMode] = React.useState(false);
  const [confirmClearCache, setConfirmClearCache] = React.useState(false);
  const [confirmMigrations, setConfirmMigrations] = React.useState(false);
  const [cacheClearing, setCacheClearing] = React.useState(false);
  const [migrationsRunning, setMigrationsRunning] = React.useState(false);

  const handleGrantAccess = () => {
    if (!grantEmail) return;
    setGrantSubmitting(true);
    setTimeout(() => {
      const days = grantDuration === "custom" ? parseInt(grantCustomDays) || 30 : parseInt(grantDuration);
      const expires = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      const newGrant: FreeGrant = {
        id: String(Date.now()),
        email: grantEmail,
        name: grantEmail.split("@")[0],
        plan: grantPlan.charAt(0).toUpperCase() + grantPlan.slice(1),
        expiresAt: expires,
        grantedAt: new Date().toISOString().slice(0, 10),
      };
      setActiveGrants((prev) => [newGrant, ...prev]);
      setGrantSubmitting(false);
      setGrantSuccess(true);
      setGrantEmail("");
      setTimeout(() => setGrantSuccess(false), 3000);
    }, 1200);
  };

  const handleRevokeGrant = (id: string) => {
    setRevoking(id);
    setTimeout(() => {
      setActiveGrants((prev) => prev.filter((g) => g.id !== id));
      setRevoking(null);
    }, 800);
  };

  const handleClearCache = () => {
    if (!confirmClearCache) { setConfirmClearCache(true); return; }
    setCacheClearing(true);
    setTimeout(() => { setCacheClearing(false); setConfirmClearCache(false); }, 2000);
  };

  const handleMigrations = () => {
    if (!confirmMigrations) { setConfirmMigrations(true); return; }
    setMigrationsRunning(true);
    setTimeout(() => { setMigrationsRunning(false); setConfirmMigrations(false); }, 3000);
  };

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

          <SaveButton onClick={() => {}} />
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-2xl">
          <h3 className="text-sm font-semibold text-white mb-1">API Keys & Integrations</h3>
          <p className="text-xs text-slate-500 mb-4">Manage third-party service credentials. Values are stored encrypted.</p>

          <MaskedField label="Stripe Secret Key" value="sk_live_••••••••••••••••••••••••••••••" status="ok" />
          <MaskedField label="OpenAI API Key" value="sk-proj-••••••••••••••••••••••••••••••" status="ok" />
          <MaskedField label="Fal.ai API Key" value="fal-key-••••••••••••••••••••••••••••" status="ok" />
          <MaskedField label="Resend API Key" value="re_••••••••••••••••••••••••••••••••" status="ok" />
          <MaskedField label="Upstash Redis URL" value="rediss://default:••••••••••••@••••.upstash.io:6379" status="ok" />
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

          <SaveButton onClick={() => {}} />
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
              <ToggleSwitch checked={maintenanceMode} onChange={setMaintenanceMode} />
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
