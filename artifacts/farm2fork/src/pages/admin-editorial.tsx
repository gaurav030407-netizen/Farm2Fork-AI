import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Filter,
  Image as ImageIcon,
  Layers,
  Leaf,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Trash2,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { Badge, Button, LoadingButton, SectionTitle, StatCard } from '@/components/ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

// API request helper with credentials
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

export const EDITORIAL_CATEGORIES = [
  // Homepage Content
  { group: 'Homepage Content', value: 'Homepage: Announcements & Banners' },
  { group: 'Homepage Content', value: 'Homepage: Informational Cards' },
  // Agricultural Information
  { group: 'Agricultural Information', value: 'Agricultural: Farmer Guides' },
  { group: 'Agricultural Information', value: 'Agricultural: Marketplace Guides' },
  { group: 'Agricultural Information', value: 'Agricultural: Bulk Buyer Information' },
  { group: 'Agricultural Information', value: 'Agricultural: Consumer Information' },
  { group: 'Agricultural Information', value: 'Agricultural: Driver Information' },
  { group: 'Agricultural Information', value: 'Agricultural: FAQs' },
  // Platform Content
  { group: 'Platform Content', value: 'Platform: How Farm2Fork Works' },
  { group: 'Platform Content', value: 'Platform: Role Instructions' },
  { group: 'Platform Content', value: 'Platform: Payment Information' },
  { group: 'Platform Content', value: 'Platform: Logistics Information' },
  { group: 'Platform Content', value: 'Platform: Trust & Verification' },
];

export function AdminEditorialPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // State: Operational platform data
  const [platformData, setPlatformData] = useState<any | null>(null);
  const [loadingPlatform, setLoadingPlatform] = useState(true);

  // State: Editorial content items
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state: Create / Edit
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(EDITORIAL_CATEGORIES[0].value);
  const [shortDesc, setShortDesc] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  // Dialog state: Preview
  const [previewItem, setPreviewItem] = useState<any | null>(null);

  const loadPlatformOverview = async () => {
    setLoadingPlatform(true);
    try {
      const data = await adminFetch('/api/admin/platform-overview');
      setPlatformData(data);
    } catch (err: any) {
      console.error('Failed to load platform overview:', err);
    } finally {
      setLoadingPlatform(false);
    }
  };

  const loadContentList = async () => {
    setLoadingContent(true);
    try {
      const data = await adminFetch('/api/admin/content');
      setContentItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: 'Could not load content', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    void loadPlatformOverview();
    void loadContentList();
  }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    setTitle('');
    setCategory(EDITORIAL_CATEGORIES[0].value);
    setShortDesc('');
    setBodyContent('');
    setImageUrl('');
    setStatus('DRAFT');
    setPublishAt('');
    setExpiresAt('');
    setIsEditorOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setTitle(item.title || '');
    setCategory(item.category || EDITORIAL_CATEGORIES[0].value);
    setShortDesc(item.short_description || '');
    setBodyContent(item.content || '');
    setImageUrl(item.image_url || '');
    setStatus(item.status || 'DRAFT');
    setPublishAt(item.publish_at ? item.publish_at.slice(0, 10) : '');
    setExpiresAt(item.expires_at ? item.expires_at.slice(0, 10) : '');
    setIsEditorOpen(true);
  };

  const handleSave = async (overrideStatus?: string) => {
    if (!title.trim() || !bodyContent.trim()) {
      toast({ title: 'Validation error', description: 'Title and content body are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const targetStatus = overrideStatus || status;
    try {
      const payload: any = {
        title: title.trim(),
        category: category.trim(),
        short_description: shortDesc.trim() || null,
        content: bodyContent.trim(),
        status: targetStatus,
        image_url: imageUrl.trim() || null,
        publish_at: publishAt ? new Date(publishAt).toISOString() : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };

      if (!editingItem) {
        await adminFetch('/api/admin/content', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Content Created', description: `Article saved as ${targetStatus}.` });
      } else {
        await adminFetch(`/api/admin/content/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Content Updated', description: 'Editorial changes saved successfully.' });
      }

      setIsEditorOpen(false);
      setEditingItem(null);
      void loadContentList();
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
          short_description: item.short_description || null,
          content: item.content,
          image_url: item.image_url || null,
          status: nextStatus,
          publish_at: nextStatus === 'PUBLISHED' ? new Date().toISOString() : item.publish_at,
          expires_at: item.expires_at,
        }),
      });
      toast({
        title: nextStatus === 'PUBLISHED' ? 'Article Published' : 'Moved to Drafts',
        description: `Status updated to ${nextStatus}.`,
      });
      void loadContentList();
    } catch (err: any) {
      toast({ title: 'Status Update Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleArchive = async (item: any) => {
    try {
      await adminFetch(`/api/admin/content/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: item.title,
          category: item.category,
          short_description: item.short_description || null,
          content: item.content,
          image_url: item.image_url || null,
          status: 'ARCHIVED',
        }),
      });
      toast({ title: 'Article Archived', description: 'Item moved to archived storage.' });
      void loadContentList();
    } catch (err: any) {
      toast({ title: 'Archive Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this editorial item?')) return;
    try {
      await adminFetch(`/api/admin/content/${id}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Content item deleted.' });
      void loadContentList();
    } catch (err: any) {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return contentItems.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesDesc = (item.short_description || '').toLowerCase().includes(q);
        const matchesContent = (item.content || '').toLowerCase().includes(q);
        const matchesCat = (item.category || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesContent && !matchesCat) return false;
      }
      return true;
    });
  }, [contentItems, statusFilter, categoryFilter, searchQuery]);

  const countsByStatus = useMemo(() => {
    const counts = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
    contentItems.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts]++;
    });
    return counts;
  }, [contentItems]);

  return (
    <div className="space-y-7 pb-12">
      {/* 1. Header & Navigation Back */}
      <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              data-testid="link-back-admin"
            >
              <ArrowLeft size={14} /> Back to Admin
            </Link>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">/</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              Admin Protected
            </span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
            Editorial & Platform Data
          </h1>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Manage platform announcements, guides, and FAQs, alongside verified operational platform statistics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            className="gap-1.5 text-xs font-semibold"
            onClick={() => {
              void loadPlatformOverview();
              void loadContentList();
            }}
          >
            <RefreshCw size={13} className={loadingContent || loadingPlatform ? 'animate-spin' : ''} /> Refresh
          </Button>
          <Button
            className="gap-1.5 text-xs font-bold"
            onClick={openCreateModal}
            data-testid="button-create-content"
          >
            <Plus size={14} /> Create Content
          </Button>
        </div>
      </div>

      {/* 2. Platform Overview Section (Real Database Metrics Only) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-[hsl(var(--primary))]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">
              Platform Overview
            </h2>
          </div>
          <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
            {loadingPlatform ? 'Querying database...' : 'Live operational values'}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Users */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Users
              </span>
              <Users size={16} className="text-blue-600" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold">
              {loadingPlatform ? '—' : (platformData?.users?.farmers + platformData?.users?.buyers + platformData?.users?.consumers + platformData?.users?.drivers || 0)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <div>🌾 Farmers: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.users?.farmers ?? 0}</span></div>
              <div>🛒 Bulk Buyers: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.users?.buyers ?? 0}</span></div>
              <div>👥 Consumers: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.users?.consumers ?? 0}</span></div>
              <div>🚚 Drivers: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.users?.drivers ?? 0}</span></div>
            </div>
          </div>

          {/* Marketplace */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Marketplace
              </span>
              <Boxes size={16} className="text-emerald-600" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold">
              {loadingPlatform ? '—' : (platformData?.marketplace?.active_listings ?? 0)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <div>Active lots: <span className="font-semibold text-emerald-600">{platformData?.marketplace?.active_listings ?? 0}</span></div>
              <div>Sold lots: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.marketplace?.sold_listings ?? 0}</span></div>
              <div>Crop types: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.marketplace?.crop_count ?? 0}</span></div>
              <div>Varieties: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.marketplace?.variety_count ?? 0}</span></div>
            </div>
          </div>

          {/* Orders */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Orders
              </span>
              <Package size={16} className="text-amber-600" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold">
              {loadingPlatform ? '—' : (platformData?.orders?.pending + platformData?.orders?.paid + platformData?.orders?.delivered + platformData?.orders?.cancelled || 0)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <div>Pending: <span className="font-semibold text-amber-600">{platformData?.orders?.pending ?? 0}</span></div>
              <div>Paid: <span className="font-semibold text-blue-600">{platformData?.orders?.paid ?? 0}</span></div>
              <div>Delivered: <span className="font-semibold text-emerald-600">{platformData?.orders?.delivered ?? 0}</span></div>
              <div>Cancelled: <span className="font-semibold text-red-500">{platformData?.orders?.cancelled ?? 0}</span></div>
            </div>
          </div>

          {/* Payments */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Payments
              </span>
              <WalletCards size={16} className="text-purple-600" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold">
              {loadingPlatform ? '—' : (platformData?.payments?.successful ?? 0)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <div>Successful: <span className="font-semibold text-emerald-600">{platformData?.payments?.successful ?? 0}</span></div>
              <div>Pending: <span className="font-semibold text-amber-600">{platformData?.payments?.pending ?? 0}</span></div>
              <div>Failed: <span className="font-semibold text-red-500">{platformData?.payments?.failed ?? 0}</span></div>
              <div>Refunded: <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.payments?.refunded ?? 0}</span></div>
            </div>
          </div>
        </div>

        {/* Second Row: Drivers, Market Data, Notifications, Reports */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Drivers */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Drivers
              </span>
              <Truck size={16} className="text-sky-600" />
            </div>
            <div className="mt-2 text-[11px] space-y-1 text-[hsl(var(--muted-foreground))]">
              <div className="flex justify-between"><span>Pending approval:</span> <span className="font-semibold text-amber-600">{platformData?.drivers?.pending_approval ?? 0}</span></div>
              <div className="flex justify-between"><span>Approved drivers:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.drivers?.approved ?? 0}</span></div>
              <div className="flex justify-between"><span>Active on route:</span> <span className="font-semibold text-emerald-600">{platformData?.drivers?.active ?? 0}</span></div>
              <div className="flex justify-between"><span>Deliveries done:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.drivers?.deliveries ?? 0}</span></div>
            </div>
          </div>

          {/* Market Data */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Market Data
              </span>
              <BarChart3 size={16} className="text-emerald-600" />
            </div>
            <div className="mt-2 text-[11px] space-y-1 text-[hsl(var(--muted-foreground))]">
              <div className="flex justify-between"><span>Cached records:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.market_data?.cached_market_records ?? 0}</span></div>
              <div className="flex justify-between"><span>Crops / Varieties:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.market_data?.crop_count ?? 0} / {platformData?.market_data?.variety_count ?? 0}</span></div>
              <div className="flex justify-between"><span>Cache status:</span> <span className="font-semibold text-emerald-600">{platformData?.market_data?.cache_status ?? 'ACTIVE'}</span></div>
              <div className="flex justify-between"><span>Last failure:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.market_data?.last_failure ?? 'None'}</span></div>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Notifications
              </span>
              <Bell size={16} className="text-indigo-600" />
            </div>
            <div className="mt-2 text-[11px] space-y-1 text-[hsl(var(--muted-foreground))]">
              <div className="flex justify-between"><span>Email status:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.notifications?.email_status ?? '0 sent'}</span></div>
              <div className="flex justify-between"><span>SMS status:</span> <span className="font-semibold text-[hsl(var(--foreground))]">{platformData?.notifications?.sms_status ?? '0 sent'}</span></div>
              <div className="flex justify-between"><span>Failed dispatches:</span> <span className="font-semibold text-red-500">{platformData?.notifications?.notification_failures ?? 0}</span></div>
            </div>
          </div>

          {/* Reports & Disputes */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Reports & Disputes
              </span>
              <ShieldCheck size={16} className="text-rose-600" />
            </div>
            <div className="mt-2 text-[11px] space-y-1 text-[hsl(var(--muted-foreground))]">
              <div className="flex justify-between"><span>Open cases:</span> <span className="font-semibold text-amber-600">{platformData?.reports?.open ?? 0}</span></div>
              <div className="flex justify-between"><span>Investigating:</span> <span className="font-semibold text-blue-600">{platformData?.reports?.investigating ?? 0}</span></div>
              <div className="flex justify-between"><span>Resolved:</span> <span className="font-semibold text-emerald-600">{platformData?.reports?.resolved ?? 0}</span></div>
            </div>
          </div>
        </div>
      </div>

      <hr className="border-[hsl(var(--border))]" />

      {/* 3. Editorial Content & Management Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[hsl(var(--foreground))]">
              Recent Editorial ({filteredItems.length})
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Create, review, publish, and schedule agricultural guides, platform notices, and FAQs.
            </p>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${statusFilter === 'ALL' ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            >
              All ({contentItems.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('DRAFT')}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${statusFilter === 'DRAFT' ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            >
              Drafts ({countsByStatus.DRAFT})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PUBLISHED')}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${statusFilter === 'PUBLISHED' ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            >
              Published ({countsByStatus.PUBLISHED})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ARCHIVED')}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${statusFilter === 'ARCHIVED' ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            >
              Archived ({countsByStatus.ARCHIVED})
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs">
            <Search size={14} className="text-[hsl(var(--muted-foreground))]" />
            <input
              type="text"
              placeholder="Search editorial by title, excerpt, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent focus:outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[hsl(var(--muted-foreground))]" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {EDITORIAL_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Editorial Table */}
        <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-4 py-3">Title & Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Summary / Excerpt</th>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {loadingContent ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    Loading editorial content...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    No editorial articles found matching the current filters. Click "Create Content" to add one.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[hsl(var(--muted)/.25)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[hsl(var(--foreground))]">{item.title}</div>
                      <div className="mt-0.5 inline-block text-[10px] font-medium text-[hsl(var(--primary))]">
                        {item.category}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.status === 'PUBLISHED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : item.status === 'DRAFT'
                            ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-[hsl(var(--muted-foreground))]">
                      {item.short_description || item.content}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.image_url ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                          <ImageIcon size={12} /> Yes
                        </span>
                      ) : (
                        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[10px] text-[hsl(var(--muted-foreground))]">
                      <div>Published: {item.publish_at ? new Date(item.publish_at).toLocaleDateString('en-IN') : 'Immediate'}</div>
                      {item.expires_at && <div>Expires: {new Date(item.expires_at).toLocaleDateString('en-IN')}</div>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setPreviewItem(item)}
                          title="Preview Content"
                        >
                          <Eye size={11} /> View
                        </Button>
                        <Button
                          variant="secondary"
                          className={`h-6 px-2 text-[10px] font-semibold ${
                            item.status === 'PUBLISHED'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                          onClick={() => void handleTogglePublish(item)}
                        >
                          {item.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => openEditModal(item)}
                          title="Edit Article"
                        >
                          <Pencil size={11} /> Edit
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-6 px-2 text-[10px] text-zinc-600 hover:text-zinc-900"
                          onClick={() => void handleArchive(item)}
                          title="Archive"
                        >
                          <Archive size={11} />
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-6 px-2 text-[10px] text-red-600 hover:text-red-800"
                          onClick={() => void handleDelete(item.id)}
                          title="Delete permanently"
                        >
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
      </div>

      {/* 4. Content Editor Modal */}
      <Dialog open={isEditorOpen} onOpenChange={(open) => { if (!open) setIsEditorOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              {editingItem ? 'Edit Editorial Content' : 'Create New Editorial Content'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Publish announcements, agricultural guides, or platform workflow information.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 pt-2 text-xs">
            <div>
              <label className="font-semibold text-[hsl(var(--foreground))]">Title *</label>
              <input
                type="text"
                placeholder="e.g. Best Practices for Kharif Onion Storage & Curing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="font-semibold text-[hsl(var(--foreground))]">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
                >
                  {EDITORIAL_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[hsl(var(--foreground))]">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-xs focus:outline-none"
                >
                  <option value="DRAFT">DRAFT (Saved in editorial desk)</option>
                  <option value="PUBLISHED">PUBLISHED (Live across platform)</option>
                  <option value="ARCHIVED">ARCHIVED (Inactive archive)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-[hsl(var(--foreground))]">Short Description / Excerpt</label>
              <textarea
                rows={2}
                placeholder="A brief summary for previews and cards..."
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-[hsl(var(--foreground))]">Content Body *</label>
              <textarea
                rows={7}
                placeholder="Write the full body content, guidance notes, instructions, or markdown formatting..."
                value={bodyContent}
                onChange={(e) => setBodyContent(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-[hsl(var(--foreground))]">Cover / Image URL (Optional)</label>
              <input
                type="text"
                placeholder="https://... or /images/..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="font-semibold text-[hsl(var(--foreground))]">Publish Date (Optional)</label>
                <input
                  type="date"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[hsl(var(--foreground))]">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsEditorOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleSave('DRAFT')}
              disabled={saving}
            >
              Save Draft
            </Button>
            <LoadingButton
              pending={saving}
              onClick={() => void handleSave('PUBLISHED')}
              className="bg-[hsl(var(--primary))] font-bold text-white"
            >
              Publish Now
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Article Preview Modal */}
      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              {previewItem?.category}
            </div>
            <DialogTitle className="font-display text-xl font-bold">
              {previewItem?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Status: <span className="font-semibold">{previewItem?.status}</span> · Published: {previewItem?.publish_at ? new Date(previewItem.publish_at).toLocaleDateString('en-IN') : 'Immediate'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-3.5 text-xs leading-relaxed text-[hsl(var(--foreground))]">
            {previewItem?.image_url && (
              <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <img
                  src={previewItem.image_url}
                  alt={previewItem.title}
                  className="h-48 w-full object-cover"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              </div>
            )}

            {previewItem?.short_description && (
              <p className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] p-3 italic text-[hsl(var(--muted-foreground))]">
                {previewItem.short_description}
              </p>
            )}

            <div className="whitespace-pre-wrap leading-relaxed">
              {previewItem?.content}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3">
            <Button variant="secondary" onClick={() => setPreviewItem(null)}>
              Close
            </Button>
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
            <Button
              className="bg-[hsl(var(--primary))] text-white font-bold"
              onClick={() => {
                const item = previewItem;
                setPreviewItem(null);
                openEditModal(item);
              }}
            >
              <Pencil size={12} className="mr-1" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
