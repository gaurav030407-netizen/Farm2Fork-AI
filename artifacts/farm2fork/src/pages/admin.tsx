import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Users,
  Sprout,
  ShoppingBasket,
  Truck,
  Boxes,
  Leaf,
  ClipboardList,
  WalletCards,
  Route,
  BarChart3,
  PackageSearch,
  ShieldCheck,
  MessageSquare,
  Bell,
  Clock3,
  Settings2,
  Search,
  Filter,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  Pencil,
  Trash2,
  RefreshCw,
  Download,
  ShieldAlert,
  Key,
  Check,
  ChevronRight,
  ChevronDown,
  Building,
  Phone,
  Mail,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, LoadingButton, SectionTitle, StatCard } from '@/components/ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

// Helper for API requests
async function adminFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) msg = data.detail;
      else if (data?.message) msg = data.message;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export type AdminSection =
  | 'dashboard'
  | 'users'
  | 'farmers'
  | 'buyers'
  | 'consumers'
  | 'drivers'
  | 'listings'
  | 'crops'
  | 'orders'
  | 'payments'
  | 'logistics'
  | 'market'
  | 'media'
  | 'reports'
  | 'content'
  | 'editorial'
  | 'notifications'
  | 'audit-logs'
  | 'settings';

export const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: any; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: '14 real-time platform metrics & activity' },
  { id: 'users', label: 'Users', icon: Users, description: 'All registered platform accounts & statuses' },
  { id: 'farmers', label: 'Farmers', icon: Sprout, description: 'Farm profiles, land size & crop listings' },
  { id: 'buyers', label: 'Bulk Buyers', icon: ShoppingBasket, description: 'B2B wholesalers, retailers & order stats' },
  { id: 'consumers', label: 'Consumers', icon: Users, description: 'Direct household buyers & order history' },
  { id: 'drivers', label: 'Drivers', icon: Truck, description: 'Driver verification, vehicle docs & approvals' },
  { id: 'listings', label: 'Crop Listings', icon: Boxes, description: 'Harvest listings, pricing & moderation' },
  { id: 'crops', label: 'Crops & Varieties', icon: Leaf, description: 'Master crop catalog & variety separation' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, description: 'Active & past harvest trade transactions' },
  { id: 'payments', label: 'Payments', icon: WalletCards, description: 'Razorpay transaction status & receipts' },
  { id: 'logistics', label: 'Logistics', icon: Route, description: 'Delivery dispatch & safe OTP verification' },
  { id: 'market', label: 'Market Data', icon: BarChart3, description: 'Agmarknet mandi prices & live sync' },
  { id: 'media', label: 'Media Moderation', icon: PackageSearch, description: 'Produce photos, videos & signed media URLs' },
  { id: 'reports', label: 'Reports & Disputes', icon: ShieldCheck, description: 'User complaints, flags & resolutions' },
  { id: 'editorial', label: 'Editorial & Platform Data', icon: MessageSquare, description: 'Dedicated announcements, guides & live data' },
  { id: 'notifications', label: 'Notifications Log', icon: Bell, description: 'SMS & Email communication audit records' },
  { id: 'audit-logs', label: 'Audit Logs', icon: Clock3, description: 'Security audit events & administrative actions' },
  { id: 'settings', label: 'Settings', icon: Settings2, description: 'Platform configuration & security policies' },
];

export function AdminPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { profile } = useAuth();

  // Determine current section from location path
  const currentSection: AdminSection = useMemo(() => {
    const parts = location.split('/');
    if (parts[1] === 'admin' && parts[2]) {
      const match = ADMIN_SECTIONS.find((s) => s.id === parts[2]);
      if (match) return match.id;
    }
    return 'dashboard';
  }, [location]);

  const selectSection = (id: AdminSection) => {
    if (id === 'dashboard') setLocation('/admin');
    else if (id === 'editorial') setLocation('/admin/editorial');
    else setLocation(`/admin/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Section Switcher Pills for quick jump */}
      <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono-ui text-xs font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
            <ShieldCheck size={16} /> Admin Control Center
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
            {ADMIN_SECTIONS.find((s) => s.id === currentSection)?.label}
          </h1>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {ADMIN_SECTIONS.find((s) => s.id === currentSection)?.description}
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() => window.print()}
          >
            <Download size={14} /> Export View
          </Button>
        </div>
      </div>

      {/* Persistent Section Tab Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        {ADMIN_SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = currentSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => selectSection(sec.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-[hsl(var(--primary))] text-white shadow-xs'
                  : 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <Icon size={14} />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render active section */}
      <div className="min-h-[500px]">
        {currentSection === 'dashboard' && <AdminDashboardSection onSelectSection={selectSection} />}
        {currentSection === 'users' && <AdminUsersSection currentAdminId={profile?.id} />}
        {currentSection === 'farmers' && <AdminFarmersSection />}
        {currentSection === 'buyers' && <AdminBuyersSection />}
        {currentSection === 'consumers' && <AdminConsumersSection />}
        {currentSection === 'drivers' && <AdminDriversSection />}
        {currentSection === 'listings' && <AdminListingsSection />}
        {currentSection === 'crops' && <AdminCropsSection />}
        {currentSection === 'orders' && <AdminOrdersSection />}
        {currentSection === 'payments' && <AdminPaymentsSection />}
        {currentSection === 'logistics' && <AdminLogisticsSection />}
        {currentSection === 'market' && <AdminMarketSection />}
        {currentSection === 'media' && <AdminMediaSection />}
        {currentSection === 'reports' && <AdminReportsSection />}
        {currentSection === 'content' && <AdminContentSection />}
        {currentSection === 'notifications' && <AdminNotificationsSection />}
        {currentSection === 'audit-logs' && <AdminAuditLogsSection />}
        {currentSection === 'settings' && <AdminSettingsSection />}
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 1: DASHBOARD (14 Real Metrics)
   ========================================================================= */
function AdminDashboardSection({ onSelectSection }: { onSelectSection: (id: AdminSection) => void }) {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<Record<string, number>>('/api/admin/dashboard');
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--destructive)/.2)] bg-[hsl(var(--destructive)/.05)] p-8 text-center">
        <AlertTriangle className="mx-auto mb-2 text-[hsl(var(--destructive))]" />
        <p className="font-semibold text-[hsl(var(--destructive))]">Unable to load platform metrics</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{error}</p>
        <Button variant="secondary" className="mt-4" onClick={loadStats}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending driver approvals alert banner if any */}
      {stats.pending_driver_approvals > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <Truck className="size-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold">{stats.pending_driver_approvals} Driver Approval(s) Pending Action</p>
              <p className="text-xs opacity-80">Unapproved drivers are strictly restricted from accepting delivery jobs.</p>
            </div>
          </div>
          <Button variant="secondary" className="text-xs font-bold" onClick={() => onSelectSection('drivers')}>
            Review Drivers
          </Button>
        </div>
      )}

      {/* Flagged listings alert */}
      {stats.flagged_listings > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <div className="flex items-center gap-3">
            <ShieldAlert className="size-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold">{stats.flagged_listings} Listing(s) Flagged for Moderation</p>
              <p className="text-xs opacity-80">Review content policy and produce media compliance.</p>
            </div>
          </div>
          <Button variant="secondary" className="text-xs font-bold" onClick={() => onSelectSection('listings')}>
            Review Listings
          </Button>
        </div>
      )}

      {/* 14 Stat Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Active Farmers"
          value={String(stats.farmers ?? 0)}
          detail="Verified producer accounts"
          icon={<Sprout size={17} />}
          accent
        />
        <StatCard
          label="Active Bulk Buyers"
          value={String(stats.buyers ?? 0)}
          detail="Commercial wholesalers & retailers"
          icon={<ShoppingBasket size={17} />}
        />
        <StatCard
          label="Active Consumers"
          value={String(stats.consumers ?? 0)}
          detail="Direct household purchasers"
          icon={<Users size={17} />}
        />
        <StatCard
          label="Active Drivers"
          value={String(stats.drivers ?? 0)}
          detail="Logistics delivery partners"
          icon={<Truck size={17} />}
        />
        <StatCard
          label="Pending Driver Approvals"
          value={String(stats.pending_driver_approvals ?? 0)}
          detail="Awaiting background approval"
          icon={<Clock size={17} />}
        />
        <StatCard
          label="Total Crop Listings"
          value={String(stats.listings ?? 0)}
          detail="Lifetime crops posted"
          icon={<Boxes size={17} />}
        />
        <StatCard
          label="Active Crop Listings"
          value={String(stats.active_listings ?? 0)}
          detail="Currently open for trade"
          icon={<Leaf size={17} />}
          accent
        />
        <StatCard
          label="Pending Orders"
          value={String(stats.pending_orders ?? 0)}
          detail="In-flight trade transactions"
          icon={<ClipboardList size={17} />}
        />
        <StatCard
          label="Delivered Orders"
          value={String(stats.completed_orders ?? 0)}
          detail="Successfully completed orders"
          icon={<CheckCircle2 size={17} />}
        />
        <StatCard
          label="Pending Payments"
          value={String(stats.pending_payments ?? 0)}
          detail="Awaiting settlement"
          icon={<WalletCards size={17} />}
        />
        <StatCard
          label="Total Transactions"
          value={String(stats.transactions ?? 0)}
          detail="Lifetime processed payments"
          icon={<WalletCards size={17} />}
        />
        <StatCard
          label="Flagged Listings"
          value={String(stats.flagged_listings ?? 0)}
          detail="Requires moderator inspection"
          icon={<ShieldAlert size={17} />}
        />
        <StatCard
          label="Verification Requests"
          value={String(stats.verification_requests ?? 0)}
          detail="KYC / Identity checks"
          icon={<ShieldCheck size={17} />}
        />
        <StatCard
          label="Active Delivery Jobs"
          value={String(stats.active_delivery_jobs ?? 0)}
          detail="Dispatches in transit"
          icon={<Route size={17} />}
        />
      </div>

      {/* Quick Launchpad to all 18 sections */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Control Center Sections</h2>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Quick navigation to all administrative operations.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_SECTIONS.filter((s) => s.id !== 'dashboard').map((sec) => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => onSelectSection(sec.id)}
                className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3.5 text-left transition-all hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted)/.4)]"
              >
                <div className="rounded-lg bg-[hsl(var(--primary)/.1)] p-2 text-[hsl(var(--primary))]">
                  <Icon size={18} />
                </div>
                <div>
                  <div className="text-xs font-bold text-[hsl(var(--foreground))]">{sec.label}</div>
                  <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] line-clamp-1">{sec.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 2: USERS
   ========================================================================= */
function AdminUsersSection({ currentAdminId }: { currentAdminId?: string }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Status update modal
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [nextStatus, setNextStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'DELETED'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const data = await adminFetch(`/api/admin/users?${params.toString()}`);
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, roleFilter, statusFilter]);

  const handleUpdateStatus = async () => {
    if (!selectedUser) return;
    setUpdating(true);
    try {
      await adminFetch(`/api/admin/users/${selectedUser.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          account_status: nextStatus,
          reason: statusReason.trim() || undefined,
        }),
      });
      toast({ title: 'Success', description: `User status changed to ${nextStatus}.` });
      setSelectedUser(null);
      setStatusReason('');
      void loadUsers();
    } catch (err: any) {
      toast({ title: 'Action Failed', description: err.message, variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:border-[hsl(var(--primary))] focus:outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All Roles</option>
          <option value="FARMER">Farmer</option>
          <option value="BUYER">Bulk Buyer</option>
          <option value="CONSUMER">Consumer</option>
          <option value="DRIVER">Driver</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DELETED">Deleted</option>
        </select>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          Showing {users.length} of {total} users
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Verifications</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  No users found matching your filters.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 font-semibold text-[hsl(var(--foreground))]">
                    <div>{u.name || 'Unnamed User'}</div>
                    <div className="text-[11px] font-normal text-[hsl(var(--muted-foreground))]">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-[hsl(var(--primary)/.1)] px-2 py-0.5 font-mono text-[10px] font-bold text-[hsl(var(--primary))]">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {u.phone_number || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        title={u.email_verified ? 'Email Verified' : 'Email Unverified'}
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          u.email_verified ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        <Mail size={10} /> {u.email_verified ? '✓' : '✗'}
                      </span>
                      <span
                        title={u.phone_verified ? 'Phone Verified' : 'Phone Unverified'}
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          u.phone_verified ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        <Phone size={10} /> {u.phone_verified ? '✓' : '✗'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        u.account_status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : u.account_status === 'SUSPENDED'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {u.account_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.account_status === 'ACTIVE' ? (
                      <Button
                        variant="secondary"
                        className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700"
                        onClick={() => {
                          setSelectedUser(u);
                          setNextStatus('SUSPENDED');
                          setStatusReason('');
                        }}
                      >
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700"
                        onClick={() => {
                          setSelectedUser(u);
                          setNextStatus('ACTIVE');
                          setStatusReason('');
                        }}
                      >
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* User Status Modal */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nextStatus === 'ACTIVE' ? 'Reactivate Account' : 'Suspend Account'}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.name} ({selectedUser?.email})
            </DialogDescription>
          </DialogHeader>

          {selectedUser?.role === 'ADMIN' && nextStatus !== 'ACTIVE' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangle className="mb-1 inline size-4 mr-1 text-amber-600" />
              <strong>Warning:</strong> You are modifying an Administrator account. The system strictly prevents suspending the last active admin.
            </div>
          )}

          <div className="space-y-3 pt-2">
            <label className="text-xs font-semibold text-[hsl(var(--foreground))]">Reason for status change</label>
            <textarea
              rows={3}
              placeholder="e.g. Identity verification issue, terms violation, or requested reactivation..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs focus:border-[hsl(var(--primary))] focus:outline-none"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSelectedUser(null)}>
              Cancel
            </Button>
            <LoadingButton
              variant={nextStatus === 'ACTIVE' ? 'primary' : 'danger'}
              pending={updating}
              onClick={handleUpdateStatus}
            >
              Confirm {nextStatus}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 3: FARMERS
   ========================================================================= */
function AdminFarmersSection() {
  const [farmers, setFarmers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    void adminFetch(`/api/admin/farmers${params}`)
      .then((data) => {
        if (active) setFarmers(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <input
          type="text"
          placeholder="Search farmers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Farmer</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Land & Type</th>
              <th className="px-4 py-3">Crops Grown</th>
              <th className="px-4 py-3">Listings</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading farmers...</td></tr>
            ) : farmers.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No farmers found.</td></tr>
            ) : (
              farmers.map((f) => (
                <tr key={f.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{f.name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{f.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{f.farm_location || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {f.farm_size ? `${f.farm_size} ${f.farm_size_unit || 'acres'}` : '—'} ({f.farming_type || 'Conventional'})
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {f.crops_grown && f.crops_grown.length > 0 ? (
                        f.crops_grown.map((crop: string) => (
                          <span key={crop} className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px]">
                            {crop}
                          </span>
                        ))
                      ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{f.listings_count}</td>
                  <td className="px-4 py-3 font-semibold">{f.orders_count}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {f.account_status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 4: BULK BUYERS
   ========================================================================= */
function AdminBuyersSection() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    void adminFetch(`/api/admin/buyers${params}`)
      .then((data) => {
        if (active) setBuyers(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <input
          type="text"
          placeholder="Search bulk buyers or businesses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Bulk Buyer Name</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Preferred Crops</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading bulk buyers...</td></tr>
            ) : buyers.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No bulk buyers found.</td></tr>
            ) : (
              buyers.map((b) => (
                <tr key={b.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{b.name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{b.email}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">{b.business_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-semibold">
                      {b.buyer_type || 'Wholesaler'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{b.location || '—'}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {Array.isArray(b.preferred_crops) ? b.preferred_crops.join(', ') : b.preferred_crops || '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold">{b.orders_count}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {b.account_status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 5: CONSUMERS
   ========================================================================= */
function AdminConsumersSection() {
  const [consumers, setConsumers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    void adminFetch(`/api/admin/consumers${params}`)
      .then((data) => {
        if (active) setConsumers(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <input
          type="text"
          placeholder="Search consumers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Consumer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Delivery Address</th>
              <th className="px-4 py-3">Total Orders</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading consumers...</td></tr>
            ) : consumers.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No consumers found.</td></tr>
            ) : (
              consumers.map((c) => (
                <tr key={c.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{c.name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{c.phone_number || '—'}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] max-w-xs truncate">{c.delivery_address || '—'}</td>
                  <td className="px-4 py-3 font-semibold">{c.orders_count}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {c.account_status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 6: DRIVERS (Driver Approval Enforcement)
   ========================================================================= */
function AdminDriversSection() {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal decision
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [nextApproval, setNextApproval] = useState<'APPROVED' | 'REJECTED' | 'SUSPENDED'>('APPROVED');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/api/admin/drivers');
      setDrivers(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrivers();
  }, []);

  const handleDecision = async () => {
    if (!selectedDriver) return;
    setSubmitting(true);
    try {
      await adminFetch(`/api/admin/drivers/${selectedDriver.driver_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          approval_status: nextApproval,
          reason: reason.trim() || undefined,
        }),
      });
      toast({ title: 'Driver Updated', description: `Driver status marked as ${nextApproval}.` });
      setSelectedDriver(null);
      setReason('');
      void loadDrivers();
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Policy banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-xs text-[hsl(var(--muted-foreground))]">
        <ShieldCheck size={18} className="text-[hsl(var(--primary))] shrink-0" />
        <div>
          <span className="font-bold text-[hsl(var(--foreground))]">Driver Dispatch Verification Rule: </span>
          Only drivers marked as <strong className="text-emerald-700">APPROVED</strong> can be dispatched for crop delivery jobs. Pending or unverified drivers are strictly locked out of job claims.
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">License & Vehicle</th>
              <th className="px-4 py-3">Approval Status</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Deliveries</th>
              <th className="px-4 py-3">Earnings</th>
              <th className="px-4 py-3 text-right">Moderation Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading drivers...</td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No drivers registered yet.</td></tr>
            ) : (
              drivers.map((d) => (
                <tr key={d.driver_id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{d.name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{d.email} • {d.phone_number}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-[11px] font-semibold">{d.license_number || 'No License'}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{d.vehicle_type} • {d.vehicle_number}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        d.approval_status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : d.approval_status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {d.approval_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`size-2 inline-block rounded-full mr-1.5 ${d.is_active ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                    {d.is_active ? 'Online' : 'Offline'}
                  </td>
                  <td className="px-4 py-3 font-semibold">{d.deliveries_count}</td>
                  <td className="px-4 py-3 font-semibold">₹{d.total_earnings || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {d.approval_status !== 'APPROVED' && (
                        <Button
                          variant="secondary"
                          className="h-7 px-2.5 text-[11px] text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          onClick={() => {
                            setSelectedDriver(d);
                            setNextApproval('APPROVED');
                            setReason('');
                          }}
                        >
                          <Check size={12} /> Approve
                        </Button>
                      )}
                      {d.approval_status === 'PENDING' && (
                        <Button
                          variant="secondary"
                          className="h-7 px-2.5 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setSelectedDriver(d);
                            setNextApproval('REJECTED');
                            setReason('');
                          }}
                        >
                          <XCircle size={12} /> Reject
                        </Button>
                      )}
                      {d.approval_status === 'APPROVED' && (
                        <Button
                          variant="secondary"
                          className="h-7 px-2.5 text-[11px] text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          onClick={() => {
                            setSelectedDriver(d);
                            setNextApproval('SUSPENDED');
                            setReason('');
                          }}
                        >
                          Suspend
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Driver Decision Modal */}
      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Driver Approval Status</DialogTitle>
            <DialogDescription>
              {selectedDriver?.name} • License: {selectedDriver?.license_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="text-xs">
              Next Status: <strong className="font-mono uppercase">{nextApproval}</strong>
            </div>
            <label className="text-xs font-semibold text-[hsl(var(--foreground))]">Optional Reason / Note</label>
            <textarea
              rows={3}
              placeholder="e.g. Verified driving license & vehicle registration papers..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs focus:border-[hsl(var(--primary))] focus:outline-none"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSelectedDriver(null)}>Cancel</Button>
            <LoadingButton
              variant={nextApproval === 'APPROVED' ? 'primary' : 'danger'}
              pending={submitting}
              onClick={handleDecision}
            >
              Submit {nextApproval}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 7: CROP LISTINGS (Moderation)
   ========================================================================= */
function AdminListingsSection() {
  const { toast } = useToast();
  const [listings, setListings] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Moderation modal
  const [selectedListing, setSelectedListing] = useState<any | null>(null);
  const [nextListingStatus, setNextListingStatus] = useState<string>('ACTIVE');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await adminFetch(`/api/admin/listings?${params.toString()}`);
      setListings(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void loadListings();
    }, 250);
    return () => clearTimeout(t);
  }, [search, statusFilter]);

  const handleModerate = async () => {
    if (!selectedListing) return;
    setSubmitting(true);
    try {
      await adminFetch(`/api/admin/listings/${selectedListing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextListingStatus,
          reason: reason.trim() || undefined,
        }),
      });
      toast({ title: 'Listing Updated', description: `Listing status marked as ${nextListingStatus}.` });
      setSelectedListing(null);
      setReason('');
      void loadListings();
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search crop, variety, or farmer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FLAGGED">Flagged</option>
          <option value="HIDDEN">Hidden</option>
          <option value="SOLD">Sold</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Produce</th>
              <th className="px-4 py-3">Farmer & Location</th>
              <th className="px-4 py-3">Quantity & Price</th>
              <th className="px-4 py-3">Listing Status</th>
              <th className="px-4 py-3">Moderation</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading listings...</td></tr>
            ) : listings.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No crop listings found.</td></tr>
            ) : (
              listings.map((item) => (
                <tr key={item.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{item.crop_name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                      Variety: <span className="font-medium text-[hsl(var(--foreground))]">{item.variety_name || 'Other / Not specified'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.farmer_name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{item.location || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{item.quantity} {item.unit || 'kg'}</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">₹{item.price_per_unit}/{item.unit || 'kg'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                      item.status === 'FLAGGED' ? 'bg-red-100 text-red-800' :
                      item.status === 'HIDDEN' ? 'bg-zinc-100 text-zinc-700' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 font-mono text-[10px]">
                      {item.moderation_status || 'UNMODERATED'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        className="h-7 px-2.5 text-[11px]"
                        onClick={() => {
                          setSelectedListing(item);
                          setNextListingStatus(item.status === 'ACTIVE' ? 'FLAGGED' : 'ACTIVE');
                          setReason('');
                        }}
                      >
                        Moderate
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Moderation Dialog */}
      <Dialog open={!!selectedListing} onOpenChange={(open) => !open && setSelectedListing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Moderate Crop Listing</DialogTitle>
            <DialogDescription>
              {selectedListing?.crop_name} ({selectedListing?.variety_name || 'Other / Not specified'}) by {selectedListing?.farmer_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold">Select Target Status</label>
              <select
                value={nextListingStatus}
                onChange={(e) => setNextListingStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
              >
                <option value="ACTIVE">ACTIVE (Approved for public marketplace)</option>
                <option value="FLAGGED">FLAGGED (Requires review / violation warning)</option>
                <option value="HIDDEN">HIDDEN (Removed from marketplace search)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Reason / Audit Log Note</label>
              <textarea
                rows={3}
                placeholder="State the reason for this moderation action..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs focus:outline-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSelectedListing(null)}>Cancel</Button>
            <LoadingButton pending={submitting} onClick={handleModerate}>
              Update Status
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 8: CROPS & VARIETIES (Variety != Crop Separation Rule)
   ========================================================================= */
function AdminCropsSection() {
  const { toast } = useToast();
  const [crops, setCrops] = useState<any[]>([]);
  const [selectedCrop, setSelectedCrop] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // New crop modal
  const [showAddCrop, setShowAddCrop] = useState(false);
  const [cropName, setCropName] = useState('');
  const [cropCategory, setCropCategory] = useState('Vegetables');
  const [creatingCrop, setCreatingCrop] = useState(false);

  // New variety modal
  const [showAddVariety, setShowAddVariety] = useState(false);
  const [varietyName, setVarietyName] = useState('');
  const [creatingVariety, setCreatingVariety] = useState(false);
  const [varietyError, setVarietyError] = useState<string | null>(null);

  const loadCrops = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/api/admin/crops');
      setCrops(data);
      if (data.length > 0) {
        setSelectedCrop((prev: any) => data.find((c: any) => c.id === prev?.id) || data[0]);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCrops();
  }, []);

  const handleCreateCrop = async () => {
    if (!cropName.trim()) return;
    setCreatingCrop(true);
    try {
      await adminFetch('/api/admin/crops', {
        method: 'POST',
        body: JSON.stringify({
          name: cropName.trim(),
          category: cropCategory,
          is_active: true,
        }),
      });
      toast({ title: 'Crop Added', description: `${cropName} added to master catalog.` });
      setCropName('');
      setShowAddCrop(false);
      void loadCrops();
    } catch (err: any) {
      toast({ title: 'Creation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setCreatingCrop(false);
    }
  };

  const handleCreateVariety = async () => {
    if (!selectedCrop || !varietyName.trim()) return;
    setVarietyError(null);

    // CRITICAL ENFORCEMENT: Variety is NEVER the crop name!
    if (varietyName.trim().toLowerCase() === selectedCrop.name.trim().toLowerCase()) {
      setVarietyError(`A variety cannot have the same name as its parent crop "${selectedCrop.name}". Use "Other / Not specified" or a specific cultivar.`);
      return;
    }

    setCreatingVariety(true);
    try {
      await adminFetch(`/api/admin/crops/${selectedCrop.id}/varieties`, {
        method: 'POST',
        body: JSON.stringify({
          name: varietyName.trim(),
          is_active: true,
        }),
      });
      toast({ title: 'Variety Added', description: `Variety "${varietyName}" added to ${selectedCrop.name}.` });
      setVarietyName('');
      setShowAddVariety(false);
      void loadCrops();
    } catch (err: any) {
      setVarietyError(err.message);
    } finally {
      setCreatingVariety(false);
    }
  };

  const handleToggleCropActive = async (crop: any) => {
    try {
      await adminFetch(`/api/admin/crops/${crop.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !crop.is_active }),
      });
      void loadCrops();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleVarietyActive = async (variety: any) => {
    try {
      await adminFetch(`/api/admin/varieties/${variety.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !variety.is_active }),
      });
      void loadCrops();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Catalog Rule Note */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
        <strong className="text-[hsl(var(--foreground))]">Catalog Taxonomy Rule: </strong>
        Every crop listing requires an accurate crop and a distinct variety. Variety names cannot be identical to the crop name. If a specific variety is unknown, the catalog provides an automatic <em>"Other / Not specified"</em> fallback.
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Crops Master List (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">Crops Master List ({crops.length})</h2>
            <Button variant="secondary" className="h-7 px-2.5 text-xs font-bold" onClick={() => setShowAddCrop(true)}>
              <Plus size={13} /> Add Crop
            </Button>
          </div>

          <div className="divide-y divide-[hsl(var(--border))] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-xs text-[hsl(var(--muted-foreground))]">Loading crops...</div>
            ) : crops.length === 0 ? (
              <div className="p-6 text-center text-xs text-[hsl(var(--muted-foreground))]">No crops found.</div>
            ) : (
              crops.map((c) => {
                const isSelected = selectedCrop?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCrop(c)}
                    className={`flex cursor-pointer items-center justify-between p-3 transition-colors ${
                      isSelected ? 'bg-[hsl(var(--primary)/.1)] border-l-4 border-l-[hsl(var(--primary))]' : 'hover:bg-[hsl(var(--muted)/.4)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-[hsl(var(--foreground))]">{c.name}</div>
                      <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        {c.category} • {(c.varieties || []).length} varieties
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleCropActive(c);
                        }}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {c.is_active ? 'Active' : 'Disabled'}
                      </button>
                      <ChevronRight size={14} className="text-[hsl(var(--muted-foreground))]" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Varieties for Selected Crop (7 cols) */}
        <div className="space-y-3 lg:col-span-7">
          {selectedCrop ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">
                    Varieties for "{selectedCrop.name}"
                  </h2>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Category: {selectedCrop.category} • Distinct cultivars under this crop
                  </p>
                </div>
                <Button className="h-7 px-2.5 text-xs font-bold" onClick={() => { setShowAddVariety(true); setVarietyError(null); }}>
                  <Plus size={13} /> Add Variety
                </Button>
              </div>

              <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                    <tr>
                      <th className="px-4 py-3">Variety / Cultivar</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {/* Default fallback variety row */}
                    <tr className="bg-[hsl(var(--muted)/.15)]">
                      <td className="px-4 py-3 font-semibold text-[hsl(var(--foreground))]">
                        Other / Not specified <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-normal">(System Fallback)</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          Always Available
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] text-[hsl(var(--muted-foreground))]">
                        Protected
                      </td>
                    </tr>

                    {(selectedCrop.varieties || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                          No custom varieties defined for {selectedCrop.name} yet. Click "Add Variety" to define specific types.
                        </td>
                      </tr>
                    ) : (
                      selectedCrop.varieties.map((v: any) => (
                        <tr key={v.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                          <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
                            {v.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              v.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'
                            }`}>
                              {v.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="secondary"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => void handleToggleVarietyActive(v)}
                            >
                              {v.is_active ? 'Disable' : 'Enable'}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))]">
              Select a crop from the left list to view and manage its varieties.
            </div>
          )}
        </div>
      </div>

      {/* Add Crop Dialog */}
      <Dialog open={showAddCrop} onOpenChange={setShowAddCrop}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Crop to Catalog</DialogTitle>
            <DialogDescription>Define a master agricultural crop category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold">Crop Name</label>
              <input
                type="text"
                placeholder="e.g. Tomato, Wheat, Soybean..."
                value={cropName}
                onChange={(e) => setCropName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Category</label>
              <select
                value={cropCategory}
                onChange={(e) => setCropCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
              >
                <option value="Vegetables">Vegetables</option>
                <option value="Fruits">Fruits</option>
                <option value="Grains">Grains & Cereals</option>
                <option value="Pulses">Pulses & Legumes</option>
                <option value="Spices">Spices</option>
                <option value="Oilseeds">Oilseeds</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddCrop(false)}>Cancel</Button>
            <LoadingButton pending={creatingCrop} onClick={handleCreateCrop}>
              Add Crop
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Variety Dialog */}
      <Dialog open={showAddVariety} onOpenChange={setShowAddVariety}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Variety for {selectedCrop?.name}</DialogTitle>
            <DialogDescription>Cultivar name must be distinct and cannot equal "{selectedCrop?.name}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {varietyError && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
                {varietyError}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold">Variety / Cultivar Name</label>
              <input
                type="text"
                placeholder="e.g. Nashik Red, Sharbati, Alphonso..."
                value={varietyName}
                onChange={(e) => {
                  setVarietyName(e.target.value);
                  setVarietyError(null);
                }}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddVariety(false)}>Cancel</Button>
            <LoadingButton pending={creatingVariety} onClick={handleCreateVariety}>
              Add Variety
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 9: ORDERS
   ========================================================================= */
function AdminOrdersSection() {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    void adminFetch(`/api/admin/orders?${params.toString()}`)
      .then((data) => {
        if (active) setOrders(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search order ID, bulk buyer, or farmer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="SHIPPED">Shipped</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Bulk Buyer</th>
              <th className="px-4 py-3">Farmer</th>
              <th className="px-4 py-3">Items Summary</th>
              <th className="px-4 py-3">Total Amount</th>
              <th className="px-4 py-3">Order Status</th>
              <th className="px-4 py-3">Payment Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={9} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No orders found.</td></tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 font-mono text-[11px] font-bold text-[hsl(var(--primary))]">
                    #{String(o.id).slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{o.buyer_name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{o.buyer_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{o.farmer_name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{o.farmer_phone}</div>
                  </td>
                  <td className="px-4 py-3 font-medium max-w-xs truncate">
                    {o.crop_summary || 'Harvest items'}
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-700 dark:text-emerald-400">
                    ₹{o.total_amount}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-bold">
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      o.payment_status === 'COMPLETED' || o.payment_status === 'PAID'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {o.payment_status || 'PENDING'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => setSelectedOrder(o)}>
                      Inspect
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Order details dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order #{String(selectedOrder?.id).slice(0, 8)}</DialogTitle>
            <DialogDescription>Placed on {selectedOrder ? new Date(selectedOrder.created_at).toLocaleString() : ''}</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[hsl(var(--muted)/.3)] p-3">
                <div>
                  <div className="text-[10px] uppercase text-[hsl(var(--muted-foreground))] font-bold">Bulk Buyer</div>
                  <div className="font-semibold">{selectedOrder.buyer_name}</div>
                  <div>{selectedOrder.buyer_email}</div>
                  <div>{selectedOrder.buyer_phone}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[hsl(var(--muted-foreground))] font-bold">Farmer / Producer</div>
                  <div className="font-semibold">{selectedOrder.farmer_name}</div>
                  <div>{selectedOrder.farmer_phone}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[hsl(var(--muted-foreground))] font-bold">Delivery Address</div>
                <div className="mt-0.5 rounded-lg border border-[hsl(var(--border))] p-2 bg-[hsl(var(--card))]">
                  {selectedOrder.delivery_address || 'No address provided'}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[hsl(var(--border))] pt-2 font-bold text-sm">
                <span>Total Amount:</span>
                <span className="text-emerald-700">₹{selectedOrder.total_amount}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 10: PAYMENTS
   ========================================================================= */
function AdminPaymentsSection() {
  const [payments, setPayments] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    void adminFetch(`/api/admin/payments${params}`)
      .then((data) => {
        if (active) setPayments(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <input
          type="text"
          placeholder="Search payment reference or user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-9 pr-3 text-xs focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Transaction ID</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Gateway Ref</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={9} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading payments...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No payment records found.</td></tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 font-mono text-[11px] font-bold">
                    #{String(p.id).slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                    #{String(p.order_id).slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.payer_name || 'Bulk Buyer'}</td>
                  <td className="px-4 py-3 font-medium">{p.recipient_name || 'Farmer'}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700 dark:text-emerald-400">₹{p.amount}</td>
                  <td className="px-4 py-3">{p.payment_method || 'Razorpay / UPI'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                    {p.razorpay_payment_id || p.razorpay_order_id || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      p.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      p.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 11: LOGISTICS (Safe OTP Verification Booleans)
   ========================================================================= */
function AdminLogisticsSection() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void adminFetch('/api/admin/deliveries')
      .then((data) => {
        if (active) setDeliveries(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Security Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-xs text-[hsl(var(--muted-foreground))]">
        <ShieldCheck size={18} className="text-[hsl(var(--primary))] shrink-0" />
        <div>
          <span className="font-bold text-[hsl(var(--foreground))]">Cryptographic OTP Verification Protection: </span>
          In compliance with security standards, OTP verification status is handled via cryptographically safe flags. Raw OTP codes are hashed upon creation and are never displayed or stored in plaintext.
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Tracking / Job ID</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Assigned Driver</th>
              <th className="px-4 py-3">Pickup Address</th>
              <th className="px-4 py-3">Delivery Address</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Pickup OTP</th>
              <th className="px-4 py-3">Delivery OTP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading logistics...</td></tr>
            ) : deliveries.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No delivery jobs currently active.</td></tr>
            ) : (
              deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 font-mono text-[11px] font-bold text-[hsl(var(--primary))]">
                    {d.tracking_number || `#${String(d.id).slice(0, 8)}`}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">#{String(d.order_id).slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    {d.driver_name ? (
                      <div>
                        <div className="font-semibold">{d.driver_name}</div>
                        <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{d.driver_phone}</div>
                      </div>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        Unassigned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-[hsl(var(--muted-foreground))]">{d.pickup_address || '—'}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-[hsl(var(--muted-foreground))]">{d.drop_address || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-bold">
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      d.pickup_otp_verified
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {d.pickup_otp_verified ? <Check size={12} /> : null}
                      {d.pickup_otp_verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      d.delivery_otp_verified
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {d.delivery_otp_verified ? <Check size={12} /> : null}
                      {d.delivery_otp_verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 12: MARKET DATA (Live Agmarknet Sync)
   ========================================================================= */
function AdminMarketSection() {
  const { toast } = useToast();
  const [marketInfo, setMarketInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadMarket = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/api/admin/market');
      setMarketInfo(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMarket();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await adminFetch('/api/admin/market/sync', { method: 'POST' });
      toast({ title: 'Sync Triggered', description: res.message || 'Market data updated successfully.' });
      void loadMarket();
    } catch (err: any) {
      toast({ title: 'Sync Notice', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sync Control Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-bold text-[hsl(var(--foreground))]">Agmarknet Price Intelligence Data</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Total records tracked: <strong className="text-[hsl(var(--foreground))]">{marketInfo?.total_records ?? 0}</strong> •
            Last synchronized: <strong className="text-[hsl(var(--foreground))]">{marketInfo?.last_sync ? new Date(marketInfo.last_sync).toLocaleString() : 'Never'}</strong>
          </div>
        </div>
        <LoadingButton pending={syncing} onClick={handleSync} className="text-xs font-bold">
          <RefreshCw size={14} /> Trigger Agmarknet Live Sync
        </LoadingButton>
      </div>

      {/* Recent Mandi Prices Table */}
      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Commodity / Crop</th>
              <th className="px-4 py-3">Market / Mandi</th>
              <th className="px-4 py-3">State & District</th>
              <th className="px-4 py-3">Modal Price</th>
              <th className="px-4 py-3">Price Range (Min - Max)</th>
              <th className="px-4 py-3">Arrival Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading mandi data...</td></tr>
            ) : !marketInfo?.recent_prices || marketInfo.recent_prices.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No market price records found. Click sync above.</td></tr>
            ) : (
              marketInfo.recent_prices.map((m: any, idx: number) => (
                <tr key={idx} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 font-semibold text-[hsl(var(--foreground))]">{m.commodity}</td>
                  <td className="px-4 py-3 font-medium">{m.market}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{m.state} • {m.district}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700 dark:text-emerald-400">₹{m.modal_price} / Qtl</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">₹{m.min_price} - ₹{m.max_price}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{m.arrival_date || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 13: MEDIA MODERATION (Signed URLs)
   ========================================================================= */
function AdminMediaSection() {
  const { toast } = useToast();
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/api/admin/media');
      setMediaItems(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, []);

  const handleUpdateModeration = async (mediaId: string, status: string) => {
    try {
      await adminFetch(`/api/admin/media/${mediaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ moderation_status: status }),
      });
      toast({ title: 'Media Moderated', description: `Media status marked as ${status}.` });
      void loadMedia();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">Produce Media Library ({mediaItems.length})</h2>
        <Button variant="secondary" className="h-7 px-2.5 text-xs" onClick={loadMedia}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />
          ))}
        </div>
      ) : mediaItems.length === 0 ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
          No listing media uploaded yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {mediaItems.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
              <div className="relative aspect-video w-full bg-zinc-900 flex items-center justify-center">
                {item.signed_url ? (
                  <img src={item.signed_url} alt="produce preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-[11px] text-zinc-400">Media URL unavailable</div>
                )}
                <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  item.moderation_status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                  item.moderation_status === 'FLAGGED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {item.moderation_status || 'PENDING'}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <div className="text-xs font-bold text-[hsl(var(--foreground))] truncate">{item.listing_title || item.crop_name || 'Produce Media'}</div>
                  <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Uploaded by {item.uploader_name || 'Farmer'}</div>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-[hsl(var(--border))]">
                  {item.moderation_status !== 'APPROVED' && (
                    <Button
                      variant="secondary"
                      className="h-6 flex-1 px-1.5 text-[10px] text-emerald-700"
                      onClick={() => void handleUpdateModeration(item.id, 'APPROVED')}
                    >
                      Approve
                    </Button>
                  )}
                  {item.moderation_status !== 'FLAGGED' && (
                    <Button
                      variant="secondary"
                      className="h-6 flex-1 px-1.5 text-[10px] text-red-700"
                      onClick={() => void handleUpdateModeration(item.id, 'FLAGGED')}
                    >
                      Flag
                    </Button>
                  )}
                  {item.moderation_status !== 'HIDDEN' && (
                    <Button
                      variant="secondary"
                      className="h-6 flex-1 px-1.5 text-[10px] text-zinc-600"
                      onClick={() => void handleUpdateModeration(item.id, 'HIDDEN')}
                    >
                      Hide
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   SECTION 14: REPORTS & DISPUTES
   ========================================================================= */
function AdminReportsSection() {
  const { toast } = useToast();
  const [reports, setReports] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Resolution modal
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState('RESOLVED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const data = await adminFetch(`/api/admin/reports${params}`);
      setReports(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [statusFilter]);

  const handleResolve = async () => {
    if (!selectedReport) return;
    setSubmitting(true);
    try {
      await adminFetch(`/api/admin/reports/${selectedReport.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: resolutionStatus,
          resolution_note: resolutionNote.trim() || undefined,
        }),
      });
      toast({ title: 'Report Updated', description: `Report marked as ${resolutionStatus}.` });
      setSelectedReport(null);
      setResolutionNote('');
      void loadReports();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All Report Statuses</option>
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Report ID</th>
              <th className="px-4 py-3">Reporter</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading reports...</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No user reports found.</td></tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 font-mono text-[11px] font-bold">#{String(r.id).slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.reporter_name || 'Anonymous User'}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{r.reporter_email}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[hsl(var(--foreground))]">{r.reason}</td>
                  <td className="px-4 py-3 max-w-sm truncate text-[hsl(var(--muted-foreground))]">{r.description}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === 'OPEN' ? 'bg-red-100 text-red-800' :
                      r.status === 'INVESTIGATING' ? 'bg-amber-100 text-amber-800' :
                      r.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => setSelectedReport(r)}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Resolution Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review User Report</DialogTitle>
            <DialogDescription>
              Reason: {selectedReport?.reason}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-xl bg-[hsl(var(--muted)/.4)] p-3 text-xs">
              <div className="font-bold text-[hsl(var(--foreground))]">User Description:</div>
              <p className="mt-1 text-[hsl(var(--muted-foreground))]">{selectedReport?.description}</p>
            </div>
            <div>
              <label className="text-xs font-semibold">Update Status</label>
              <select
                value={resolutionStatus}
                onChange={(e) => setResolutionStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
              >
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Resolution Note</label>
              <textarea
                rows={3}
                placeholder="Explain the outcome or action taken..."
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs focus:outline-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSelectedReport(null)}>Cancel</Button>
            <LoadingButton pending={submitting} onClick={handleResolve}>
              Save Decision
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 15: EDITORIAL / CONTENT
   ========================================================================= */
function AdminContentSection() {
  const { toast } = useToast();
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Market Guide');
  const [shortDesc, setShortDesc] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [saving, setSaving] = useState(false);

  const loadContent = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/api/admin/content');
      setContentItems(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContent();
  }, []);

  const openCreateModal = () => {
    setIsNew(true);
    setEditingItem(null);
    setTitle('');
    setCategory('Market Guide');
    setShortDesc('');
    setBodyContent('');
    setStatus('DRAFT');
  };

  const openEditModal = (item: any) => {
    setIsNew(false);
    setEditingItem(item);
    setTitle(item.title || '');
    setCategory(item.category || 'Market Guide');
    setShortDesc(item.short_description || '');
    setBodyContent(item.content || '');
    setStatus(item.status || 'DRAFT');
  };

  const handleSaveContent = async () => {
    if (!title.trim() || !bodyContent.trim()) {
      toast({ title: 'Missing Fields', description: 'Title and content are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category: category.trim(),
        short_description: shortDesc.trim() || undefined,
        content: bodyContent.trim(),
        status,
      };

      if (isNew) {
        await adminFetch('/api/admin/content', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Content Created', description: 'New article created.' });
      } else {
        await adminFetch(`/api/admin/content/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Content Updated', description: 'Article updated successfully.' });
      }
      setIsNew(false);
      setEditingItem(null);
      void loadContent();
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (item: any) => {
    const nextStatus = item.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await adminFetch(`/api/admin/content/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: item.title,
          category: item.category,
          short_description: item.short_description || undefined,
          content: item.content,
          status: nextStatus,
        }),
      });
      toast({
        title: nextStatus === 'PUBLISHED' ? 'Article Published' : 'Article Moved to Draft',
        description: `Status updated to ${nextStatus}.`,
      });
      void loadContent();
    } catch (err: any) {
      toast({ title: 'Status Update Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteContent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this editorial article?')) return;
    try {
      await adminFetch(`/api/admin/content/${id}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Content item deleted.' });
      void loadContent();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-800 dark:bg-emerald-950/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-emerald-950 dark:text-emerald-200">Dedicated Editorial & Platform Data Page Available</h3>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">Manage full publication workflows, agricultural FAQs, and real-time operational database stats on the separate URL.</p>
        </div>
        <Link href="/admin/editorial" className="inline-flex items-center gap-1.5 rounded-xl bg-[#155337] px-4 py-2 text-xs font-bold text-white hover:bg-[#11422c] transition-colors shrink-0 shadow-xs">
          Open Editorial & Data Page →
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">Editorial Content & Guides ({contentItems.length})</h2>
        <Button className="h-7 px-2.5 text-xs font-bold" onClick={openCreateModal}>
          <Plus size={13} /> Create Article
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Title & Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Publish Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading editorial content...</td></tr>
            ) : contentItems.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No editorial articles yet. Click Create Article above.</td></tr>
            ) : (
              contentItems.map((c) => (
                <tr key={c.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{c.title}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{c.category}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                      c.status === 'DRAFT' ? 'bg-zinc-100 text-zinc-700' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-sm truncate text-[hsl(var(--muted-foreground))]">
                    {c.short_description || c.content}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {c.publish_at ? new Date(c.publish_at).toLocaleDateString() : 'Immediate'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => setPreviewItem(c)}>
                        <Eye size={11} /> View
                      </Button>
                      <Button
                        variant="secondary"
                        className={`h-6 px-2 text-[10px] font-semibold ${c.status === 'PUBLISHED' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                        onClick={() => void handleTogglePublish(c)}
                      >
                        {c.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => openEditModal(c)}>
                        <Pencil size={11} /> Edit
                      </Button>
                      <Button variant="secondary" className="h-6 px-2 text-[10px] text-red-600" onClick={() => void handleDeleteContent(c.id)}>
                        <Trash2 size={11} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Article Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">{previewItem?.category}</div>
            <DialogTitle className="text-lg font-bold">{previewItem?.title}</DialogTitle>
            <DialogDescription>Status: {previewItem?.status} · Published: {previewItem?.publish_at ? new Date(previewItem.publish_at).toLocaleDateString() : 'Immediate'}</DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-3 text-xs leading-relaxed text-[hsl(var(--foreground))]">
            {previewItem?.short_description && (
              <p className="rounded-lg bg-[hsl(var(--muted)/.5)] p-3 italic text-[hsl(var(--muted-foreground))]">
                {previewItem.short_description}
              </p>
            )}
            <div className="whitespace-pre-wrap font-sans text-xs">{previewItem?.content}</div>
          </div>
          <DialogFooter className="gap-2 pt-3">
            <Button variant="secondary" onClick={() => setPreviewItem(null)}>Close</Button>
            <Button
              variant="secondary"
              className={previewItem?.status === 'PUBLISHED' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}
              onClick={() => {
                const item = previewItem;
                setPreviewItem(null);
                void handleTogglePublish(item);
              }}
            >
              {previewItem?.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Content Form Dialog */}
      <Dialog open={isNew || !!editingItem} onOpenChange={(open) => { if (!open) { setIsNew(false); setEditingItem(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Create New Article' : 'Edit Article'}</DialogTitle>
            <DialogDescription>Editorial content published here is accessible to farmers and bulk buyers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold">Title</label>
              <input
                type="text"
                placeholder="e.g. Best Practices for Kharif Onion Storage"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
                >
                  <option value="Market Guide">Market Guide</option>
                  <option value="Farming Advice">Farming Advice</option>
                  <option value="Platform News">Platform News</option>
                  <option value="Policy & Standards">Policy & Standards</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Short Summary</label>
              <input
                type="text"
                placeholder="Brief excerpt displayed on previews..."
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Content (Markdown / Text)</label>
              <textarea
                rows={8}
                placeholder="Full article content..."
                value={bodyContent}
                onChange={(e) => setBodyContent(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs focus:outline-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setIsNew(false); setEditingItem(null); }}>Cancel</Button>
            <LoadingButton pending={saving} onClick={handleSaveContent}>
              Save Article
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 16: NOTIFICATIONS LOG
   ========================================================================= */
function AdminNotificationsSection() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void adminFetch('/api/admin/notifications')
      .then((data) => {
        if (active) setNotifications(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Provider Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading notifications...</td></tr>
            ) : notifications.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No notifications dispatched yet.</td></tr>
            ) : (
              notifications.map((n) => (
                <tr key={n.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {new Date(n.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{n.recipient_name}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{n.recipient_email || n.recipient_phone}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] font-bold">{n.kind}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-bold">
                      {n.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      n.status === 'SENT' ? 'bg-emerald-100 text-emerald-800' :
                      n.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] max-w-xs truncate">
                    {n.last_error || 'Delivered successfully'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 17: AUDIT LOGS
   ========================================================================= */
function AdminAuditLogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<any | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = eventTypeFilter ? `?event_type=${encodeURIComponent(eventTypeFilter)}` : '';
    void adminFetch(`/api/admin/audit-logs${params}`)
      .then((data) => {
        if (active) setLogs(data.items || []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventTypeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All Security Events</option>
          <option value="USER_LOGIN">USER_LOGIN</option>
          <option value="USER_DELETED">USER_DELETED</option>
          <option value="USER_SUSPENDED">USER_SUSPENDED</option>
          <option value="DRIVER_APPROVED">DRIVER_APPROVED</option>
          <option value="LISTING_MODERATED">LISTING_MODERATED</option>
          <option value="CONTENT_UPDATED">CONTENT_UPDATED</option>
          <option value="PASSWORD_CHANGED">PASSWORD_CHANGED</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Event Type</th>
              <th className="px-4 py-3">Target Identifier</th>
              <th className="px-4 py-3 text-right">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading audit logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No audit events logged for this filter.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[hsl(var(--muted)/.3)]">
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[hsl(var(--foreground))]">{log.actor_name || 'System / Guest'}</div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{log.actor_email || log.actor_role || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] font-bold rounded bg-[hsl(var(--primary)/.1)] px-2 py-0.5 text-[hsl(var(--primary))]">
                      {log.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[hsl(var(--muted-foreground))] truncate max-w-xs">
                    {log.identifier || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="secondary"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setExpandedLog(log)}
                    >
                      Inspect JSON
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Metadata dialog */}
      <Dialog open={!!expandedLog} onOpenChange={(open) => !open && setExpandedLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Audit Event Metadata</DialogTitle>
            <DialogDescription>{expandedLog?.event_type} at {expandedLog ? new Date(expandedLog.created_at).toLocaleString() : ''}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-72 overflow-y-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100">
            {JSON.stringify(expandedLog?.metadata || {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =========================================================================
   SECTION 18: SETTINGS
   ========================================================================= */
function AdminSettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void adminFetch('/api/admin/settings')
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch((err) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <span>Admin Accounts</span>
            <Lock size={16} className="text-[hsl(var(--primary))]" />
          </div>
          <div className="font-display text-2xl font-bold">{settings?.admin_count ?? '—'}</div>
          <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Active administrators with full platform access</div>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <span>Storage Backend</span>
            <Boxes size={16} className="text-[hsl(var(--primary))]" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${settings?.storage_configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-display text-lg font-bold">{settings?.storage_configured ? 'Supabase S3 Ready' : 'Local / Demo Mode'}</span>
          </div>
          <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Signed media URLs and upload authorization</div>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <span>Market Data Sync</span>
            <BarChart3 size={16} className="text-[hsl(var(--primary))]" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${settings?.market_sync_configured ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
            <span className="font-display text-lg font-bold">{settings?.market_sync_configured ? 'API Key Configured' : 'Internal Seed Data'}</span>
          </div>
          <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Agmarknet data.gov.in real-time commodity API</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">System Security & Governance Policies</h2>
        <div className="space-y-2 text-xs text-[hsl(var(--muted-foreground))]">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-[hsl(var(--foreground))]">Driver Dispatch Guard: </strong>
              Delivery dispatch is guarded by approval status. Drivers with PENDING or SUSPENDED approvals are prevented from claiming shipment jobs.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-[hsl(var(--foreground))]">Variety Separation Enforcement: </strong>
              Crop variety taxonomy enforces cultivar separation. Variety names cannot match the crop name.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-[hsl(var(--foreground))]">Account Deletion & Anonymization: </strong>
              Account deletion requires confirmation phrase "DELETE", credential verification, and checks for active transactions before anonymizing profile records.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-[hsl(var(--foreground))]">Last Admin Protection: </strong>
              The backend forbids deactivating or suspending the final active administrator account to prevent administrative lockout.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
