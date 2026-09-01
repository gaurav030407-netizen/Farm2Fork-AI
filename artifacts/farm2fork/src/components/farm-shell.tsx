import { type ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BarChart3, Bell, Boxes, ChevronRight, CircleHelp, ClipboardList, CloudSun, LayoutDashboard, Leaf, Menu, PackageCheck, Route, Search, Settings2, ShoppingBasket, Sprout, Truck, Users, X } from 'lucide-react';
import { useLanguage } from '@/i18n';

export type AppRole = 'farmer' | 'buyer' | 'admin';

const roleLabels: Record<AppRole, string> = { farmer: 'Farmer', buyer: 'Buyer', admin: 'Admin' };

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className={`flex items-center gap-2.5 ${compact ? '' : 'min-w-fit'}`} data-testid="link-brand">
    <span className="relative flex size-9 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] shadow-[0_3px_0_hsl(var(--foreground)/.18)]">
      <Leaf size={20} strokeWidth={2.5} />
      <span className="absolute bottom-1 left-2 size-1.5 rounded-full bg-[hsl(var(--primary))]" />
    </span>
    {!compact && <span className="font-display text-[21px] font-bold tracking-[-.04em]">Farm<span className="text-[hsl(var(--accent))]">2</span>Fork</span>}
  </Link>;
}

function navItems(role: AppRole) {
  if (role === 'buyer') return [
    { href: '/buyer', label: 'Overview', icon: LayoutDashboard },
    { href: '/marketplace', label: 'Find produce', icon: Search },
    { href: '/orders', label: 'My orders', icon: ClipboardList },
    { href: '/insights', label: 'Market pulse', icon: BarChart3 },
    { href: '/logistics', label: 'Delivery desk', icon: Truck },
  ];
  if (role === 'admin') return [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/orders', label: 'All orders', icon: ClipboardList },
    { href: '/marketplace', label: 'Marketplace', icon: ShoppingBasket },
    { href: '/insights', label: 'Insights', icon: BarChart3 },
    { href: '/logistics', label: 'Logistics', icon: Route },
  ];
  return [
    { href: '/farmer', label: 'My farm', icon: LayoutDashboard },
    { href: '/farmer/sell', label: 'Sell a crop', icon: Sprout },
    { href: '/farmer/crops', label: 'Crop listings', icon: Boxes },
    { href: '/orders', label: 'Orders', icon: ClipboardList },
    { href: '/insights', label: 'Market insights', icon: BarChart3 },
    { href: '/logistics', label: 'Logistics', icon: Truck },
  ];
}

export function RoleSwitcher({ role, onChange, dark = false }: { role: AppRole; onChange: (role: AppRole) => void; dark?: boolean }) {
  return <div className={`flex items-center gap-1 rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-[hsl(var(--muted))]'}`} data-testid="switcher-role">
    {(['farmer', 'buyer', 'admin'] as AppRole[]).map((item) => <button
      key={item}
      type="button"
      onClick={() => onChange(item)}
      data-testid={`button-role-${item}`}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${role === item ? (dark ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]' : 'bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-sm') : (dark ? 'text-white/60 hover:text-white' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')}`}
    >{roleLabels[item]}</button>)}
  </div>;
}

export function AppShell({ role, onRole, children }: { role: AppRole; onRole: (role: AppRole) => void; children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useStateLocal(false);
  const { isHindi, toggleLanguage } = useLanguage();
  const items = navItems(role);
  return <div className="min-h-[100dvh] bg-[hsl(var(--background))]">
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-[hsl(var(--sidebar))] px-4 py-5 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-10 flex items-center justify-between px-2"><Logo /><button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden" data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="mb-4 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-white/40">Workspace</div>
      <nav className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${location === href ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--accent))]' : 'text-white/65 hover:bg-white/8 hover:text-white'}`}>
          <Icon size={18} strokeWidth={location === href ? 2.3 : 1.8} /><span>{label}</span>{location === href && <ChevronRight size={14} className="ml-auto opacity-70" />}
        </Link>)}
      </nav>
      <div className="mt-auto space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/70"><CloudSun size={15} className="text-[hsl(var(--accent))]" />Field weather</div>
          <div className="flex items-end justify-between"><span className="font-display text-3xl">28°</span><span className="text-right text-[11px] leading-4 text-white/45">Clear skies<br />Nashik, MH</span></div>
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4"><div className="flex size-9 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-sm font-bold text-[hsl(var(--foreground))]">RK</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">Ramesh & Sons</div><div className="text-[11px] text-white/45">{roleLabels[role]} workspace</div></div><Settings2 size={16} className="text-white/45" /></div>
      </div>
    </aside>
    {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-[hsl(var(--foreground)/.45)] lg:hidden" data-testid="button-overlay-menu" />}
    <div className="lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.92)] px-4 backdrop-blur-md sm:px-7">
        <div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 hover:bg-[hsl(var(--muted))] lg:hidden" data-testid="button-open-menu"><Menu size={22} /></button><div className="hidden text-sm font-medium text-[hsl(var(--muted-foreground))] sm:block">{location === '/farmer' ? 'Good morning, Ramesh' : 'Your marketplace, in hand'}</div></div>
        <div className="flex items-center gap-2 sm:gap-4"><button type="button" onClick={toggleLanguage} aria-label={isHindi ? 'Switch to English' : 'हिंदी में बदलें'} className="rounded-lg px-2 py-1.5 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-language-toggle">{isHindi ? 'English' : 'हिंदी'}</button><RoleSwitcher role={role} onChange={onRole} /><button type="button" className="relative rounded-xl p-2.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[hsl(var(--accent))]" /></button></div>
      </header>
      <main className="mx-auto max-w-[1440px] p-4 sm:p-7">{children}</main>
    </div>
  </div>;
}

function useStateLocal(initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  return [value, setValue];
}