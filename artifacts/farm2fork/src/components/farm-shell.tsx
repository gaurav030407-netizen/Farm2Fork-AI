import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BarChart3, Bell, Boxes, ChevronRight, CircleHelp, ClipboardList, Clock3, CloudSun, LayoutDashboard, Leaf, LogOut, Menu, MessageSquare, PackageCheck, PackageSearch, Route, Search, Settings2, ShieldCheck, ShoppingBasket, Sprout, Truck, Users, WalletCards, X } from 'lucide-react';
import { useLanguage } from '@/i18n';
import { useUnreadMessages, useUnreadNotifications } from '@/hooks/useMessages';
import { profilesApi, type UserProfile } from '@/lib/profiles';
import { ProfileAvatar } from '@/components/profile-ui';
import { useAuth } from '@/lib/auth';
import { useLocationWeather } from '@/hooks/use-weather';

export type AppRole = 'farmer' | 'buyer' | 'consumer' | 'driver' | 'admin';

const roleLabels: Record<AppRole, string> = { farmer: 'Farmer', buyer: 'Bulk Buyer', consumer: 'Consumer', driver: 'Driver', admin: 'Admin' };

import { LanguageSelector } from '@/components/language-selector';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${compact ? '' : 'min-w-fit'}`} data-testid="link-brand">
      <span className="relative flex size-9 items-center justify-center rounded-full bg-[#f4a024] text-white shadow-xs">
        <Leaf size={20} strokeWidth={2.5} />
      </span>
      {!compact && (
        <span className="font-display text-[22px] font-bold tracking-tight text-[#163625]">
          Farm<span className="text-[#f4a024]">2</span>Fork
        </span>
      )}
    </Link>
  );
}

function navItems(role: AppRole) {
  if (role === 'farmer') return [
    { href: '/farmer', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/farmer#my-farm', label: 'My Farm', icon: Leaf },
    { href: '/farmer/sell', label: 'Sell a Crop', icon: Sprout },
    { href: '/farmer/crops', label: 'Crop Listings', icon: Boxes },
    { href: '/orders', label: 'Orders', icon: ClipboardList },
    { href: '/insights', label: 'Market Insights', icon: BarChart3 },
    { href: '/logistics', label: 'Logistics', icon: Route },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/profile', label: 'Profile', icon: Users },
  ];
  if (role === 'buyer') return [
    { href: '/buyer', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/marketplace', label: 'Marketplace', icon: Search },
    { href: '/insights', label: 'Crop / Variety Pulse', icon: BarChart3 },
    { href: '/orders', label: 'Bulk Orders', icon: ClipboardList },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/profile', label: 'Profile', icon: Users },
  ];
  if (role === 'consumer') return [
    { href: '/', label: 'Dashboard/Home', icon: LayoutDashboard },
    { href: '/marketplace', label: 'Marketplace/Fresh Produce', icon: Search },
    { href: '/orders', label: 'Orders', icon: ClipboardList },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/profile', label: 'Profile', icon: Users },
  ];
  if (role === 'driver') return [
    { href: '/driver', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/driver#pickups', label: 'Nearby Pickups', icon: Truck },
    { href: '/driver#active', label: 'Active Delivery', icon: PackageCheck },
    { href: '/driver#history', label: 'Delivery History', icon: Clock3 },
    { href: '/driver#earnings', label: 'Earnings', icon: WalletCards },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/profile', label: 'Profile', icon: Users },
  ];
  if (role === 'admin') return [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/farmers', label: 'Farmers', icon: Sprout },
    { href: '/admin/buyers', label: 'Bulk Buyers', icon: ShoppingBasket },
    { href: '/admin/consumers', label: 'Consumers', icon: Users },
    { href: '/admin/drivers', label: 'Drivers', icon: Truck },
    { href: '/admin/listings', label: 'Crop Listings', icon: Boxes },
    { href: '/admin/crops', label: 'Crops & Varieties', icon: Leaf },
    { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
    { href: '/admin/payments', label: 'Payments', icon: WalletCards },
    { href: '/admin/logistics', label: 'Logistics', icon: Route },
    { href: '/admin/market', label: 'Market Data', icon: BarChart3 },
    { href: '/admin/media', label: 'Media Moderation', icon: PackageSearch },
    { href: '/admin/reports', label: 'Reports & Disputes', icon: ShieldCheck },
    { href: '/admin/editorial', label: 'Editorial & Platform Data', icon: MessageSquare },
    { href: '/admin/notifications', label: 'Notifications Log', icon: Bell },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: Clock3 },
    { href: '/admin/settings', label: 'Settings', icon: Settings2 },
  ];
  return [];
}

export function RoleSwitcher({ role, onChange, dark = false, allowedRoles }: { role: AppRole; onChange: (role: AppRole) => void; dark?: boolean; allowedRoles?: AppRole[] }) {
  return <div className={`flex items-center gap-1 rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-[hsl(var(--muted))]'}`} data-testid="switcher-role">
    {(['farmer', 'buyer', 'consumer', 'driver', 'admin'] as AppRole[]).filter((item) => !allowedRoles || allowedRoles.includes(item)).map((item) => <button
      key={item}
      type="button"
      onClick={() => onChange(item)}
      data-testid={`button-role-${item}`}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${role === item ? (dark ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]' : 'bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-sm') : (dark ? 'text-white/60 hover:text-white' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')}`}
    >{roleLabels[item]}</button>)}
  </div>;
}

export function AppShell({ role, onRole, onSignOut, displayName, children }: { role: AppRole; onRole: (role: AppRole) => void; onSignOut?: () => void | Promise<void>; displayName?: string; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useStateLocal(false);
  const { isHindi, toggleLanguage } = useLanguage();
  const { profile } = useAuth();
  const items = navItems(role);
  const unreadMessages = useUnreadMessages();
  const unreadNotifications = useUnreadNotifications();
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<number | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  useEffect(() => { let active = true; void profilesApi.getMe().then((value) => { if (active) { setUserProfile(value); setProfileCompletion(value.completion_percent); setProfilePhotoUrl(value.profile_photo_url ?? null); } }).catch(() => undefined); return () => { active = false; }; }, []);

  const weather = useLocationWeather(userProfile?.state, userProfile?.city || userProfile?.location);

  useEffect(() => {
    if (!accountOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountOpen]);
  const handleSignOut = async () => {
    if (!onSignOut || loggingOut) return;
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await onSignOut();
    } catch {
      setLogoutError('Logout could not be completed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };
  return <div className="min-h-[100dvh] bg-[hsl(var(--background))]">
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-[hsl(var(--sidebar))] px-4 py-5 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-6 flex items-center justify-between px-2"><Logo /><button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden" data-testid="button-close-menu"><X size={18} /></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto pr-1 pb-2">
        {items.map(({ href, label, icon: Icon }) => <Link key={`${href}-${label}`} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${location === href ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--accent))]' : 'text-white/65 hover:bg-white/8 hover:text-white'}`}>
          <Icon size={18} strokeWidth={location === href ? 2.3 : 1.8} />
          <span>{label}</span>
          {unreadMessages > 0 && label === 'Messages' && (
            <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-[hsl(var(--foreground))]">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
          {unreadNotifications > 0 && label === 'Notifications' && (
            <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-[hsl(var(--foreground))]">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
          {location === href && <ChevronRight size={14} className="ml-auto opacity-70" />}
        </Link>)}
      </nav>
      <div className="mt-auto space-y-2.5 pt-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs" data-testid="card-sidebar-weather">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50">
            <span className="flex items-center gap-1"><CloudSun size={12} className="text-emerald-400" /> Local Weather</span>
            {weather.status === "LOADING" && <span className="animate-pulse text-[10px] text-white/40">Fetching...</span>}
          </div>
          {weather.status === "NO_LOCATION" ? (
            <div className="mt-1.5 text-[11px] leading-snug text-white/70">
              <p>Select your location to see local weather.</p>
              <Link href="/profile/edit" className="mt-1 inline-block text-[10px] font-semibold text-emerald-400 hover:underline">
                Set location in profile →
              </Link>
            </div>
          ) : weather.status === "SUCCESS" ? (
            <div className="mt-1">
              <div className="font-mono-ui text-base font-bold text-white">
                {weather.temperature !== null ? `${weather.temperature}°C` : '—'} <span className="text-xs font-normal text-white/75">{weather.condition}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-emerald-300/90" title={weather.resolvedLocation ?? ""}>
                {weather.resolvedLocation}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-white/60">
              {weather.message || "Select your location to see local weather."}
            </div>
          )}
        </div>
        <div ref={accountRef} className="relative border-t border-white/10 px-1 pt-2.5">
          <div className="flex items-center gap-2.5">
            <Link href={role === 'admin' ? '/admin/settings' : '/profile'}><ProfileAvatar src={profilePhotoUrl} name={displayName ?? roleLabels[role]} size="size-8" /></Link>
            <div className="min-w-0 flex-1"><Link href={role === 'admin' ? '/admin/settings' : '/profile'} className="block truncate text-xs font-semibold text-white/90 hover:underline">{displayName ?? roleLabels[role]}</Link><div className="text-[10px] text-white/45">{roleLabels[role]} workspace</div></div>
            <button type="button" onClick={() => setAccountOpen((open) => !open)} className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Account menu" aria-expanded={accountOpen} data-testid="button-account-menu"><Settings2 size={15} /></button>
          </div>
          {accountOpen && onSignOut && <div className="absolute bottom-full left-0 right-0 z-[60] mb-2 rounded-lg border border-white/15 bg-[hsl(var(--sidebar))] p-1.5 shadow-md" role="menu">
            {role === 'admin' ? (
              <Link href="/admin/settings" onClick={() => setAccountOpen(false)} className="block rounded-md px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white" role="menuitem">Settings</Link>
            ) : (
              <>
                <Link href="/profile" onClick={() => setAccountOpen(false)} className="block rounded-md px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white" role="menuitem">Profile</Link>
                <Link href="/profile/edit" onClick={() => setAccountOpen(false)} className="block rounded-md px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white" role="menuitem">Account Settings</Link>
              </>
            )}
            <button type="button" onClick={() => void handleSignOut()} disabled={loggingOut} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60" data-testid="button-logout" role="menuitem"><LogOut size={13} /> {loggingOut ? 'Logging out...' : 'Logout'}</button>
            {logoutError && <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-red-300" role="alert">{logoutError}</p>}
          </div>}
        </div>
      </div>
    </aside>
    {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-[hsl(var(--foreground)/.45)] lg:hidden" data-testid="button-overlay-menu" />}
    <div className="lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.95)] px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 hover:bg-[hsl(var(--muted))] lg:hidden" data-testid="button-open-menu"><Menu size={20} /></button>
          <div className="hidden text-xs font-medium text-[hsl(var(--muted-foreground))] sm:block">
            {role === 'farmer' ? (profile?.email ? `Farmer: ${profile.email}` : 'Farmer Workspace') : role === 'buyer' ? 'Bulk Buyer & Wholesale Desk' : role === 'consumer' ? 'Direct Farm Produce Store' : role === 'driver' ? 'Logistics & Delivery Desk' : 'Administrator Control Panel'}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSelector variant="shell" />
          <RoleSwitcher role={role} onChange={onRole} allowedRoles={profile ? [profile.role.toLowerCase() as AppRole] : undefined} />
          <button type="button" onClick={() => setLocation(role === 'admin' ? '/admin/notifications' : '/notifications')} className="relative rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Open notifications" data-testid="button-notifications">
            <Bell size={16} />
            {unreadNotifications > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[9px] font-bold text-[hsl(var(--foreground))]">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] p-4 sm:p-6">{profileCompletion !== null && profileCompletion < 100 && location !== '/profile/edit' && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3.5 py-2.5 text-xs"><div><strong>Complete your profile</strong><span className="ml-2 text-[hsl(var(--muted-foreground))]">Add verification details and photo to build trust with buyers.</span></div><Link href="/profile/edit" className="font-semibold text-[hsl(var(--primary))] hover:underline">Complete profile</Link></div>}{children}</main>
    </div>
  </div>;
}

function useStateLocal(initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  return [value, setValue];
}