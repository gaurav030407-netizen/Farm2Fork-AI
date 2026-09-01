import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, LoaderCircle, RefreshCw } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; children: ReactNode }) {
  const variants = {
    primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-110 shadow-[0_3px_0_hsl(var(--foreground)/.16)]',
    secondary: 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
    ghost: 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
    danger: 'bg-[hsl(var(--destructive))] text-white hover:brightness-110',
  };
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'gold' | 'orange' | 'red' }) {
  const tones = { neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', green: 'bg-[hsl(150_35%_88%)] text-[hsl(var(--primary))]', gold: 'bg-[hsl(43_80%_86%)] text-[hsl(34_62%_29%)]', orange: 'bg-[hsl(25_70%_88%)] text-[hsl(20_62%_36%)]', red: 'bg-[hsl(7_68%_91%)] text-[hsl(var(--destructive))]' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

export function SectionTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <div className="mb-1 font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">{eyebrow}</div>}<h1 className="font-display text-3xl font-bold tracking-[-.035em] text-[hsl(var(--foreground))] sm:text-4xl">{title}</h1>{detail && <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail?: string; icon: ReactNode; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${accent ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}><div className="mb-6 flex items-start justify-between"><span className={`text-xs font-semibold ${accent ? 'text-white/65' : 'text-[hsl(var(--muted-foreground))]'}`}>{label}</span><span className={`rounded-lg p-2 ${accent ? 'bg-white/12 text-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--primary))]'}`}>{icon}</span></div><div className="font-display text-3xl font-bold tracking-[-.04em]">{value}</div>{detail && <div className={`mt-1 text-xs ${accent ? 'text-white/65' : 'text-[hsl(var(--muted-foreground))]'}`}>{detail}</div>}</div>;
}

export function QueryState({ loading, error, onRetry, children }: { loading: boolean; error: boolean; onRetry?: () => void; children: ReactNode }) {
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}</div>;
  if (error) return <div className="rounded-2xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] p-8 text-center"><AlertCircle className="mx-auto mb-3 text-[hsl(var(--destructive))]" /><p className="font-semibold">We could not reach the market desk.</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Your demo view is still available below.</p>{onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry} data-testid="button-retry"><RefreshCw size={15} /> Try again</Button>}</div>;
  return <>{children}</>;
}

export function Feedback({ message, kind = 'success' }: { message: string; kind?: 'success' | 'error' }) {
  return <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${kind === 'success' ? 'bg-[hsl(150_35%_88%)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'}`} role="status" data-testid="status-feedback">{kind === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}{message}</div>;
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="inline-flex items-center gap-1 text-sm font-bold text-[hsl(var(--primary))] hover:underline" data-testid="link-arrow">{children}<ArrowUpRight size={15} /></a>;
}

export function LoadingButton({ children, pending, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; pending?: boolean }) {
  return <Button {...props} disabled={pending || props.disabled}>{pending && <LoaderCircle size={16} className="animate-spin" />}{children}</Button>;
}