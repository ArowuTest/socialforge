'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ChevronRight,
  ArrowLeft,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  Video,
  MessageCircle,
  Pin,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
  Share2,
  FileText,
  Loader2,
  SkipForward,
  Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { workspaceApi, postsApi, accountsApi } from '@/lib/api'
import {
  Platform,
  PostStatus,
  AccountStatus,
  PlanType,
  SocialAccount,
  Post,
  Workspace,
} from '@/types'
import {
  cn,
  getInitials,
  formatRelativeTime,
  formatDate,
  getPlatformDisplayName,
  getPlatformColor,
} from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// ── Platform icon map ──────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<Platform, React.ElementType> = {
  [Platform.INSTAGRAM]: Instagram,
  [Platform.TIKTOK]: Video,
  [Platform.YOUTUBE]: Youtube,
  [Platform.LINKEDIN]: Linkedin,
  [Platform.TWITTER]: Twitter,
  [Platform.FACEBOOK]: Facebook,
  [Platform.PINTEREST]: Pin,
  [Platform.THREADS]: MessageCircle,
  [Platform.BLUESKY]: Globe,
}

function PlatformIcon({ platform, size = 'sm' }: { platform: Platform; size?: 'sm' | 'md' }) {
  const Icon = PLATFORM_ICONS[platform] ?? Globe
  const color = getPlatformColor(platform)
  const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return <Icon className={sizeClass} style={{ color }} />
}

// ── Plan badge ─────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: PlanType }) {
  const config: Record<PlanType, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    [PlanType.FREE]: { label: 'Free', variant: 'secondary' },
    [PlanType.STARTER]: { label: 'Starter', variant: 'secondary' },
    [PlanType.PRO]: { label: 'Pro', variant: 'default' },
    [PlanType.AGENCY]: { label: 'Agency', variant: 'default' },
    [PlanType.ENTERPRISE]: { label: 'Enterprise', variant: 'default' },
  }
  const { label, variant } = config[plan] ?? config[PlanType.FREE]
  return <Badge variant={variant}>{label}</Badge>
}

// ── Status badge ───────────────────────────────────────────────────────────

function PostStatusBadge({ status }: { status: PostStatus }) {
  const config: Record<PostStatus, { label: string; className: string }> = {
    [PostStatus.DRAFT]: {
      label: 'Draft',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
    [PostStatus.SCHEDULED]: {
      label: 'Scheduled',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    [PostStatus.PUBLISHED]: {
      label: 'Published',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    [PostStatus.FAILED]: {
      label: 'Failed',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
    [PostStatus.PROCESSING]: {
      label: 'Processing',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
  }
  const { label, className } = config[status] ?? config[PostStatus.DRAFT]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {label}
    </span>
  )
}

function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const config: Record<AccountStatus, { label: string; icon: React.ElementType; className: string }> = {
    [AccountStatus.ACTIVE]: {
      label: 'Active',
      icon: CheckCircle2,
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    [AccountStatus.EXPIRED]: {
      label: 'Expired',
      icon: Clock,
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
    [AccountStatus.ERROR]: {
      label: 'Error',
      icon: AlertCircle,
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
    [AccountStatus.DISCONNECTED]: {
      label: 'Disconnected',
      icon: AlertCircle,
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
  }
  const { label, icon: Icon, className } =
    config[status] ?? config[AccountStatus.DISCONNECTED]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  iconColor: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-800">
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
      {/* Tabs */}
      <Skeleton className="h-10 w-full max-w-md" />
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      {/* Table */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({
  workspace,
  posts,
  accounts,
}: {
  workspace: Workspace
  posts: Post[]
  accounts: SocialAccount[]
}) {
  const now = new Date()
  const monthStart = startOfMonth(now).toISOString()
  const monthEnd = endOfMonth(now).toISOString()

  const publishedThisMonth = posts.filter(
    (p) =>
      p.status === PostStatus.PUBLISHED &&
      p.publishedAt &&
      p.publishedAt >= monthStart &&
      p.publishedAt <= monthEnd,
  ).length

  const recentPosts = posts.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Posts"
          value={posts.length}
          icon={FileText}
          iconColor="text-violet-600"
        />
        <StatCard
          label="Published This Month"
          value={publishedThisMonth}
          icon={BarChart3}
          iconColor="text-sky-600"
        />
        <StatCard
          label="Connected Accounts"
          value={accounts.length}
          icon={Share2}
          iconColor="text-pink-600"
        />
        <StatCard
          label="Plan"
          value={workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1)}
          icon={CheckCircle2}
          iconColor="text-green-600"
        />
      </div>

      {/* Recent posts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Posts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <FileText className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-700" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No posts yet</p>
              <p className="text-xs text-muted-foreground">
                Posts created in this workspace will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Title</TableHead>
                    <TableHead>Platforms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPosts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell className="pl-5">
                        <p className="max-w-[200px] truncate text-sm font-medium text-gray-900 dark:text-white">
                          {post.caption || '(No caption)'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {post.platforms.map((platform) => (
                            <PlatformIcon key={platform} platform={platform as any} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PostStatusBadge status={post.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.scheduledAt
                          ? formatDate(post.scheduledAt)
                          : post.publishedAt
                          ? formatDate(post.publishedAt)
                          : formatDate(post.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Posts tab ──────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ label: string; value: PostStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: PostStatus.DRAFT },
  { label: 'Scheduled', value: PostStatus.SCHEDULED },
  { label: 'Published', value: PostStatus.PUBLISHED },
  { label: 'Failed', value: PostStatus.FAILED },
]

const PAGE_SIZE = 10

function PostsTab({ posts }: { posts: Post[] }) {
  const [filter, setFilter] = React.useState<PostStatus | 'all'>('all')
  const [page, setPage] = React.useState(1)

  const filtered = React.useMemo(
    () => (filter === 'all' ? posts : posts.filter((p) => p.status === filter)),
    [posts, filter],
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = (v: PostStatus | 'all') => {
    setFilter(v)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Status filter buttons */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <FileText className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-700" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No posts found</p>
              <p className="text-xs text-muted-foreground">
                Try a different status filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Title</TableHead>
                    <TableHead>Platforms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell className="pl-5">
                        <p className="max-w-[240px] truncate text-sm font-medium text-gray-900 dark:text-white">
                          {post.caption || '(No caption)'}
                        </p>
                        {post.tags && post.tags.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {post.tags.slice(0, 3).join(', ')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {post.platforms.map((platform) => (
                            <PlatformIcon key={platform} platform={platform as any} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PostStatusBadge status={post.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.scheduledAt
                          ? formatDate(post.scheduledAt)
                          : post.publishedAt
                          ? formatDate(post.publishedAt)
                          : formatDate(post.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({filtered.length} posts)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Accounts tab ───────────────────────────────────────────────────────────

function AccountsTab({ accounts }: { accounts: SocialAccount[] }) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Share2 className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-700" />
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          No connected accounts
        </p>
        <p className="text-xs text-muted-foreground">
          This workspace has not connected any social accounts yet.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => {
        const Icon = PLATFORM_ICONS[account.platform] ?? Globe
        const color = getPlatformColor(account.platform)
        return (
          <Card key={account.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {account.displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.handle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getPlatformDisplayName(account.platform)}
                    </p>
                  </div>
                </div>
                <AccountStatusBadge status={account.status ?? AccountStatus.ACTIVE} />
              </div>
              {(account.followerCount ?? 0) > 0 && (
                <>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {(account.followerCount ?? 0).toLocaleString()}
                    </span>{' '}
                    followers
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Settings form schema ───────────────────────────────────────────────────

const settingsSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters'),
  plan: z.nativeEnum(PlanType),
  whitelabelEnabled: z.boolean(),
})

type SettingsFormValues = z.infer<typeof settingsSchema>

// ── Settings tab ───────────────────────────────────────────────────────────

function SettingsTab({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient()
  const [suspendConfirmOpen, setSuspendConfirmOpen] = React.useState(false)
  const [isSuspended, setIsSuspended] = React.useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: workspace.name,
      plan: workspace.plan,
      whitelabelEnabled: workspace.whitelabelEnabled,
    },
  })

  const whitelabelEnabled = watch('whitelabelEnabled')

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Workspace>) => workspaceApi.update(workspace.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspace.id] })
      toast.success('Workspace settings saved.')
    },
    onError: () => {
      toast.error('Failed to save settings. Please try again.')
    },
  })

  const onSubmit = async (data: SettingsFormValues) => {
    await updateMutation.mutateAsync({
      name: data.name,
      plan: data.plan,
      whitelabelEnabled: data.whitelabelEnabled,
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Workspace settings form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Settings</CardTitle>
          <CardDescription>
            Manage the configuration for this client workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Workspace name */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="Client workspace name"
                {...register('name')}
                className={errors.name ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Plan */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-plan">Plan</Label>
              <Select
                defaultValue={workspace.plan}
                onValueChange={(v) => setValue('plan', v as PlanType, { shouldDirty: true })}
              >
                <SelectTrigger id="ws-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PlanType.STARTER}>Starter — $29/mo</SelectItem>
                  <SelectItem value={PlanType.PRO}>Pro — $97/mo</SelectItem>
                  <SelectItem value={PlanType.AGENCY}>Agency — $499/mo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* White-label toggle */}
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  White-label Branding
                </p>
                <p className="text-xs text-muted-foreground">
                  Hide ChiselPost branding for this client workspace.
                </p>
              </div>
              <Switch
                checked={whitelabelEnabled}
                onCheckedChange={(v) =>
                  setValue('whitelabelEnabled', v, { shouldDirty: true })
                }
              />
            </div>

            {/* Save */}
            <Button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-base text-red-600 dark:text-red-400">
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that affect this client workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {isSuspended ? 'Workspace Suspended' : 'Suspend Workspace'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isSuspended
                  ? 'This workspace is currently suspended. Re-enable it below.'
                  : 'Temporarily prevent the client from accessing their workspace.'}
              </p>
            </div>
            <AlertDialog open={suspendConfirmOpen} onOpenChange={setSuspendConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Switch
                  checked={isSuspended}
                  onCheckedChange={() => setSuspendConfirmOpen(true)}
                  className="data-[state=checked]:bg-red-600"
                />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isSuspended ? 'Re-enable workspace?' : 'Suspend workspace?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isSuspended
                      ? `The workspace "${workspace.name}" will be re-enabled and the client will regain access immediately.`
                      : `The workspace "${workspace.name}" will be suspended. The client will lose access immediately until you re-enable it.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={
                      isSuspended
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }
                    onClick={() => {
                      setIsSuspended((prev) => !prev)
                      toast.success(
                        isSuspended
                          ? `Workspace "${workspace.name}" has been re-enabled.`
                          : `Workspace "${workspace.name}" has been suspended.`,
                      )
                      setSuspendConfirmOpen(false)
                    }}
                  >
                    {isSuspended ? 'Re-enable' : 'Suspend'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const {
    data: workspaceData,
    isLoading: workspaceLoading,
    isError: workspaceError,
  } = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => workspaceApi.get(id),
    enabled: !!id,
  })

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['posts', id],
    queryFn: () =>
      postsApi.list({ pageSize: 10 }),
    enabled: !!id,
  })

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts', id],
    queryFn: () => accountsApi.list(),
    enabled: !!id,
  })

  const isLoading = workspaceLoading || postsLoading || accountsLoading

  if (isLoading) {
    return <PageSkeleton />
  }

  if (workspaceError || !workspaceData?.data) {
    return (
      <div className="flex flex-col items-center justify-center p-4 py-24 text-center md:p-6">
        <AlertCircle className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-700" />
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          Client not found
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          This workspace does not exist or you do not have access to it.
        </p>
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    )
  }

  const workspace = workspaceData.data
  const posts: Post[] = postsData?.data ?? []
  const accounts: SocialAccount[] = accountsData?.data ?? []

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/clients"
            className="hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Clients
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-white font-medium truncate max-w-[200px]">
            {workspace.name}
          </span>
        </nav>

        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: avatar + meta */}
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-gray-100 shadow dark:border-gray-800">
              {workspace.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={workspace.logo} alt={workspace.name} className="h-full w-full object-cover" />
              ) : null}
              <AvatarFallback className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-lg font-bold">
                {getInitials(workspace.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {workspace.name}
                </h1>
                <PlanBadge plan={workspace.plan} />
              </div>
              <p className="text-sm text-muted-foreground">
                Active since {format(new Date(workspace.createdAt), 'MMMM yyyy')}
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {/* Switch to Workspace */}
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              onClick={() => {
                toast.success(`Switching to ${workspace.name}...`)
              }}
            >
              <SkipForward className="h-4 w-4" />
              Switch to Workspace
            </Button>

            {/* Remove Client */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  Remove Client
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove client workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove{' '}
                    <strong>{workspace.name}</strong> from your agency. All
                    associated data will be lost. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => {
                      toast.success(`${workspace.name} has been removed.`)
                      router.push('/clients')
                    }}
                  >
                    Remove Client
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 w-full sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <OverviewTab
              workspace={workspace}
              posts={posts}
              accounts={accounts}
            />
          </TabsContent>

          {/* Posts */}
          <TabsContent value="posts">
            <PostsTab posts={posts} />
          </TabsContent>

          {/* Accounts */}
          <TabsContent value="accounts">
            <AccountsTab accounts={accounts} />
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings">
            <SettingsTab workspace={workspace} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
