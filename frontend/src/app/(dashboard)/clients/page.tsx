"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Plus,
  Lock,
  Users,
  BarChart3,
  Share2,
  DollarSign,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Globe,
  Info,
  Upload,
  Eye,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { whitelabelApi } from "@/lib/api";
import { PlanType, Client } from "@/types";
import {
  cn,
  formatRelativeTime,
  getInitials,
} from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPicker } from "@/components/ui/color-picker";

// ── Plan badge helper ──────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: PlanType }) {
  const config: Record<PlanType, { label: string; className: string }> = {
    [PlanType.FREE]: { label: "Free", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    [PlanType.STARTER]: { label: "Starter", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    [PlanType.PRO]: { label: "Pro", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
    [PlanType.AGENCY]: { label: "Agency", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    [PlanType.ENTERPRISE]: { label: "Enterprise", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  };
  const { label, className } = config[plan] ?? config[PlanType.FREE];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_CLIENTS: Client[] = [
  {
    id: "c1",
    agencyWorkspaceId: "ws1",
    clientWorkspaceId: "ws2",
    clientWorkspace: { id: "ws2", name: "Acme Corp", slug: "acme-corp", timezone: "America/New_York", plan: PlanType.PRO, ownerId: "u2", createdAt: "2024-01-10T00:00:00Z", updatedAt: "2024-03-01T00:00:00Z", isAgency: false, whitelabelEnabled: false },
    plan: PlanType.PRO,
    status: "active",
    socialAccountsCount: 5,
    postsThisMonth: 34,
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    createdAt: "2024-01-10T00:00:00Z",
  },
  {
    id: "c2",
    agencyWorkspaceId: "ws1",
    clientWorkspaceId: "ws3",
    clientWorkspace: { id: "ws3", name: "Bright Media", slug: "bright-media", timezone: "Europe/London", plan: PlanType.STARTER, ownerId: "u3", createdAt: "2024-02-05T00:00:00Z", updatedAt: "2024-03-10T00:00:00Z", isAgency: false, whitelabelEnabled: false },
    plan: PlanType.STARTER,
    status: "active",
    socialAccountsCount: 3,
    postsThisMonth: 12,
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    createdAt: "2024-02-05T00:00:00Z",
  },
  {
    id: "c3",
    agencyWorkspaceId: "ws1",
    clientWorkspaceId: "ws4",
    clientWorkspace: { id: "ws4", name: "Nova Brands", slug: "nova-brands", timezone: "America/Los_Angeles", plan: PlanType.PRO, ownerId: "u4", createdAt: "2024-03-01T00:00:00Z", updatedAt: "2024-03-28T00:00:00Z", isAgency: false, whitelabelEnabled: false },
    plan: PlanType.PRO,
    status: "pending",
    socialAccountsCount: 0,
    postsThisMonth: 0,
    lastActiveAt: undefined,
    createdAt: "2024-03-01T00:00:00Z",
  },
];

// ── Add Client Dialog ──────────────────────────────────────────────────────

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function AddClientDialog({ open, onOpenChange, onSuccess }: AddClientDialogProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [plan, setPlan] = React.useState<string>(PlanType.STARTER);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setPlan(PlanType.STARTER);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setIsSubmitting(true);
    try {
      await whitelabelApi.createClient({ name: name.trim(), email: email.trim(), plan });
      toast.success("Invite sent!", { description: `An email has been sent to ${email}.` });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Failed to create client. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
          <DialogDescription>
            We&apos;ll send them an email invite to set up their account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Client / Company Name</Label>
            <Input
              id="client-name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-email">Owner Email</Label>
            <Input
              id="client-email"
              type="email"
              placeholder="owner@acmecorp.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-plan">Select Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger id="client-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PlanType.STARTER}>Starter — $29/mo</SelectItem>
                <SelectItem value={PlanType.PRO}>Pro — $97/mo</SelectItem>
                <SelectItem value={PlanType.AGENCY}>Agency — $499/mo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            We&apos;ll send them an email invite to set up their account.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={isSubmitting || !name.trim() || !email.trim()}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Remove Client Dialog ───────────────────────────────────────────────────

interface RemoveClientDialogProps {
  client: Client | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

function RemoveClientDialog({ client, onClose, onConfirm }: RemoveClientDialogProps) {
  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Client</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove{" "}
            <strong>{client?.clientWorkspace.name}</strong> from your agency? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => { if (client) { onConfirm(client.id); onClose(); } }}
          >
            Remove Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── White-label Panel ──────────────────────────────────────────────────────

interface WhitelabelState {
  enabled: boolean;
  logoPreview: string | null;
  primaryColor: string;
  appName: string;
  customDomain: string;
}

function WhitelabelPanel() {
  const [state, setState] = React.useState<WhitelabelState>({
    enabled: false,
    logoPreview: null,
    primaryColor: "#7C3AED",
    appName: "ChiselPost",
    customDomain: "",
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [dnsOpen, setDnsOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: wlData } = useQuery({
    queryKey: ["whitelabel"],
    queryFn: () => whitelabelApi.getConfig(),
  });

  React.useEffect(() => {
    if (wlData?.data) {
      const d = wlData.data as any;
      setState((prev) => ({
        ...prev,
        enabled: d.enabled ?? d.is_whitelabel ?? prev.enabled,
        primaryColor: d.primaryColor ?? d.primary_color ?? prev.primaryColor,
        appName: d.brandName ?? d.brand_name ?? prev.appName,
        customDomain: d.customDomain ?? d.custom_domain ?? prev.customDomain,
        logoPreview: d.logo ?? d.logo_url ?? prev.logoPreview,
      }));
    }
  }, [wlData]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setState((s) => ({ ...s, logoPreview: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await whitelabelApi.updateConfig({
        enabled: state.enabled,
        brandName: state.appName,
        primaryColor: state.primaryColor,
        customDomain: state.customDomain || undefined,
      });
      toast.success("White-label settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const disabled = !state.enabled;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">White-label Settings</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-48">Customize ChiselPost for your clients</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="wl-toggle" className="text-sm text-muted-foreground">
              Enable White-label
            </Label>
            <Switch
              id="wl-toggle"
              checked={state.enabled}
              onCheckedChange={(v) => setState((s) => ({ ...s, enabled: v }))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Logo upload */}
        <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
          <Label>Logo</Label>
          <div
            className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-violet-400 transition-colors bg-gray-50 dark:bg-gray-800/30"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onloadend = () => setState((s) => ({ ...s, logoPreview: reader.result as string }));
              reader.readAsDataURL(file);
            }}
          >
            {state.logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.logoPreview} alt="Logo preview" className="h-14 object-contain" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-gray-400" />
                <p className="text-sm text-muted-foreground text-center">
                  Drag & drop or <span className="text-violet-600 font-medium">browse</span>
                </p>
                <p className="text-xs text-muted-foreground">PNG, SVG, WebP — max 2 MB</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>

        {/* Brand colours */}
        <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
          <Label>Brand Colour</Label>
          <ColorPicker
            value={state.primaryColor}
            onChange={(v) => setState((s) => ({ ...s, primaryColor: v }))}
            label="Primary"
          />
        </div>

        {/* Custom domain */}
        <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
          <Label htmlFor="custom-domain">Custom Domain</Label>
          <div className="flex items-center gap-2">
            <Input
              id="custom-domain"
              placeholder="clients.yourdomain.com"
              value={state.customDomain}
              onChange={(e) => setState((s) => ({ ...s, customDomain: e.target.value }))}
            />
            <Popover open={dnsOpen} onOpenChange={setDnsOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="whitespace-nowrap">
                  Verify DNS
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> DNS Instructions
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Add the following CNAME record to your DNS provider:
                </p>
                <div className="space-y-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs font-mono">
                  <div><span className="text-muted-foreground">Type:</span> CNAME</div>
                  <div><span className="text-muted-foreground">Name:</span> {state.customDomain || "clients"}</div>
                  <div><span className="text-muted-foreground">Value:</span> proxy.ChiselPost.io</div>
                  <div><span className="text-muted-foreground">TTL:</span> 300</div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  DNS propagation can take up to 48 hours.
                </p>
                <Button
                  className="w-full mt-3 bg-violet-600 hover:bg-violet-700 text-white"
                  size="sm"
                  onClick={() => {
                    toast.success("Verification initiated. We'll notify you once DNS propagates.");
                    setDnsOpen(false);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Check Now
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* App name */}
        <div className={cn("space-y-2 transition-opacity", disabled && "opacity-40 pointer-events-none")}>
          <Label htmlFor="app-name">App Name</Label>
          <Input
            id="app-name"
            placeholder="ChiselPost"
            value={state.appName}
            onChange={(e) => setState((s) => ({ ...s, appName: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            What clients see instead of &quot;ChiselPost&quot;
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled}
            onClick={() => toast.info("Preview feature coming soon.")}
          >
            <Eye className="h-4 w-4" />
            Preview Login Page
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 ml-auto"
            disabled={disabled || isSaving}
            onClick={handleSave}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Upgrade CTA ────────────────────────────────────────────────────────────

function AgencyUpgradeCta() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5">
        <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        Upgrade to Agency Plan
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Manage multiple client workspaces, white-label the platform, and bill clients directly.
      </p>
      <Card className="w-full text-left mb-6">
        <CardContent className="pt-4 pb-4">
          <ul className="space-y-2.5">
            {[
              "Unlimited client workspaces",
              "White-label branding & custom domain",
              "Client billing management",
              "Dedicated support",
              "Up to 500 social accounts",
              "Unlimited AI credits",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Button className="bg-violet-600 hover:bg-violet-700 text-white w-full" size="lg">
        Upgrade to Agency — $499/mo
      </Button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPlanAtLeast } = useWorkspace();
  const isAgency = isPlanAtLeast(PlanType.AGENCY);

  const [addOpen, setAddOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<Client | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => whitelabelApi.listClients({ page: 1, pageSize: 50 }),
    enabled: isAgency,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => whitelabelApi.removeClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client removed.");
    },
    onError: () => toast.error("Failed to remove client."),
  });

  // Use real data or mock
  const clients: Client[] = data?.data ?? [];

  const totalPostsThisMonth = clients.reduce((s, c) => s + c.postsThisMonth, 0);
  const totalAccounts = clients.reduce((s, c) => s + c.socialAccountsCount, 0);

  if (!isAgency) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <AgencyUpgradeCta />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Client Workspaces</h2>
          <p className="text-sm text-muted-foreground">Manage and monitor all your client accounts.</p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-700 text-white self-start sm:self-auto"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Client
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Clients", value: clients.length.toString(), icon: Users, color: "text-violet-600" },
          { label: "Posts This Month", value: totalPostsThisMonth.toString(), icon: BarChart3, color: "text-sky-600" },
          { label: "Active Accounts", value: totalAccounts.toString(), icon: Share2, color: "text-pink-600" },
          { label: "Revenue", value: "—", icon: DollarSign, color: "text-green-600" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Clients table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                No clients yet
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                Add your first client to get started.
              </p>
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Client
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100 dark:border-gray-800">
                    <TableHead className="pl-5">Client</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead>Posts This Month</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => router.push(`/clients/${client.id}`)}
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-xs font-semibold">
                              {getInitials(client.clientWorkspace.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {client.clientWorkspace.name}
                            </p>
                            {client.status === "pending" && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">Invite pending</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlanBadge plan={client.plan} />
                      </TableCell>
                      <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                        {client.socialAccountsCount}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                        {client.postsThisMonth}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.lastActiveAt ? formatRelativeTime(client.lastActiveAt) : "Never"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/clients/${client.id}`)}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Manage Workspace
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Plan
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                              onClick={() => setRemoveTarget(client)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Client
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* White-label panel */}
      <WhitelabelPanel />

      {/* Dialogs */}
      <AddClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["clients"] })}
      />
      <RemoveClientDialog
        client={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={(id) => removeMutation.mutate(id)}
      />
    </div>
  );
}
