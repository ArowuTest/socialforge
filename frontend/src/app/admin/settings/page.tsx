"use client";

import * as React from "react";
import {
  Settings, Key, Shield, Wrench, Save, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Trash2, RefreshCw,
  AlertCircle, ToggleLeft, ToggleRight,
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
      )}

      {/* Integrations tab */}
      {activeTab === "integrations" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-2xl">
          <h3 className="text-sm font-semibold text-white mb-1">API Keys & Integrations</h3>
          <p className="text-xs text-slate-500 mb-4">Manage third-party service credentials. Values are stored encrypted.</p>

          <MaskedField label="Stripe Secret Key" value="sk_live_••••••••••••••••••••••••••••••" status="ok" />
          <MaskedField label="OpenAI API Key" value="sk-proj-VT8mN2xKq4pL7rWj9Ys3Fb1cPmQd6AnXe5Zh" status="ok" />
          <MaskedField label="Fal.ai API Key" value="fal-key-Xm9kP3vNq7tL2sW8cYr4Bj5nF1dQ6eAh" status="ok" />
          <MaskedField label="Resend API Key" value="re_TvL3Km9pXq2nW5sY8cBj4Fr7dM1eN6aZ" status="ok" />
          <MaskedField label="Upstash Redis URL" value="redis://default:Xm8pN3vK2qL9sW4cY7rBj1nF5dQ6eAhT@apn1-redis-12345.upstash.io:6379" status="ok" />
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
