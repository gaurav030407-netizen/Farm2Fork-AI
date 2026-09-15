import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, LoaderCircle, RefreshCw } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; children: ReactNode }) {
  const variants = {
    primary: 'bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary)/.9)] border border-transparent shadow-xs',
    secondary: 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] shadow-xs',
    ghost: 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
    danger: 'bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive)/.9)] shadow-xs',
  };
  return <button {...props} className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>{children}</button>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'gold' | 'orange' | 'red' }) {
  const tones = {
    neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]',
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    gold: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    orange: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    red: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function SectionTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <div className="mb-1 font-mono-ui text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--primary))]">{eyebrow}</div>}<h1 className="font-display text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">{title}</h1>{detail && <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail?: string; icon: ReactNode; accent?: boolean }) {
  return <div className={`rounded-xl border p-4 ${accent ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]'}`}><div className="mb-3 flex items-center justify-between"><span className={`text-xs font-medium ${accent ? 'text-white/80' : 'text-[hsl(var(--muted-foreground))]'}`}>{label}</span><span className={`rounded-md p-1.5 ${accent ? 'bg-white/15 text-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--primary))]'}`}>{icon}</span></div><div className="font-display text-2xl font-bold">{value}</div>{detail && <div className={`mt-1 text-xs ${accent ? 'text-white/70' : 'text-[hsl(var(--muted-foreground))]'}`}>{detail}</div>}</div>;
}

export function QueryState({ loading, error, onRetry, children }: { loading: boolean; error: boolean; onRetry?: () => void; children: ReactNode }) {
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]" />)}</div>;
  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/20"><AlertCircle className="mx-auto mb-2 text-rose-600" size={20} /><p className="font-medium text-rose-900 dark:text-rose-200">Unable to load data from the server.</p><p className="mt-1 text-xs text-rose-700 dark:text-rose-300">Please check your connection or try again shortly.</p>{onRetry && <Button variant="secondary" className="mt-3 text-xs" onClick={onRetry} data-testid="button-retry"><RefreshCw size={14} /> Try again</Button>}</div>;
  return <>{children}</>;
}

export function Feedback({ message, kind = 'success' }: { message: string; kind?: 'success' | 'error' }) {
  return <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`} role="status" data-testid="status-feedback">{kind === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}{message}</div>;
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--primary))] hover:underline" data-testid="link-arrow">{children}<ArrowUpRight size={14} /></a>;
}

export function LoadingButton({ children, pending, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; children: ReactNode; pending?: boolean }) {
  return <Button {...props} variant={variant} disabled={pending || props.disabled}>{pending && <LoaderCircle size={15} className="animate-spin" />}{children}</Button>;
}