import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check, Sparkles } from 'lucide-react';
import { useLanguage, INDIAN_LANGUAGES, type Language } from '@/i18n';

interface LanguageSelectorProps {
  variant?: 'header' | 'shell' | 'minimal';
  className?: string;
}

export function LanguageSelector({ variant = 'header', className = '' }: LanguageSelectorProps) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = INDIAN_LANGUAGES.find((l) => l.code === language) || INDIAN_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter('');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const filteredLanguages = INDIAN_LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(filter.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(filter.toLowerCase()) ||
      l.code.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--primary))] focus:outline-none"
        data-testid="button-language-selector"
      >
        <Globe size={14} className="text-[hsl(var(--primary))]" />
        <span>{currentLang.nativeName}</span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">({currentLang.name})</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1.5 max-h-80 w-72 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg animate-in fade-in-50 zoom-in-95"
        >
          <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] p-2.5">
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">
                Select Language
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                23 Indian Languages
              </span>
            </div>
            <input
              type="search"
              placeholder="Search language..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1 text-xs outline-none focus:border-[hsl(var(--primary))]"
              autoFocus
            />
          </div>

          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-[hsl(var(--border)/.4)]">
            {filteredLanguages.map((item) => {
              const isSelected = item.code === language;
              const isFullSupport = item.status === 'available';

              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLanguage(item.code);
                    setOpen(false);
                    setFilter('');
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-[hsl(var(--muted))] ${
                    isSelected ? 'bg-[hsl(var(--primary)/.08)] font-bold text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-[13px]">{item.nativeName}</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{item.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isFullSupport ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Full
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Preview
                      </span>
                    )}
                    {isSelected && <Check size={14} className="text-[hsl(var(--primary))]" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))]">
            <div className="flex items-center gap-1">
              <Sparkles size={11} className="text-[hsl(var(--primary))]" />
              <span>English & Hindi fully active. Scheduled Indian regional rollout in progress.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
