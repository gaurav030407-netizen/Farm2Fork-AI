import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="paper-grid flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5">
      <div className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 shadow-[0_18px_40px_hsl(158_28%_16%/.1)]">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/.35)] text-[hsl(var(--primary))]"><AlertCircle size={24} /></div>
        <div className="mt-7 font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Field note 404</div>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-[-.05em]">This path is<br />not on the map.</h1>
        <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">The page may have moved, but the market is still open.</p>
        <Link href="/" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white" data-testid="link-return-home">Return to Farm2Fork</Link>
      </div>
    </div>
  );
}
