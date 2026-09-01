import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import hi from './hi.json';

export type Language = 'en' | 'hi';
type Dictionary = Record<string, string>;

const dictionaries: Record<Language, Dictionary> = { en, hi };
const originalText = new WeakMap<Text, string>();

function translateText(value: string, language: Language) {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.slice(leading.length, value.length - trailing.length || undefined);
  if (!core) return value;
  const dictionary = dictionaries[language];
  const exact = dictionary[core];
  if (exact) return `${leading}${exact}${trailing}`;
  let translated = core;
  Object.entries(dictionary)
    .filter(([key]) => key.length > 2 && key !== 'English' && key !== 'हिंदी')
    .sort(([a], [b]) => b.length - a.length)
    .forEach(([key, replacement]) => {
      translated = translated.split(key).join(replacement);
    });
  return `${leading}${translated}${trailing}`;
}

function translateDom(language: Language) {
  if (typeof document === 'undefined') return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName) && text.nodeValue?.trim()) {
      textNodes.push(text);
    }
    node = walker.nextNode();
  }
  textNodes.forEach((text) => {
    const current = text.nodeValue ?? '';
    const source = originalText.get(text) ?? current;
    if (!originalText.has(text)) originalText.set(text, source);
    const next = language === 'en' ? source : translateText(source, language);
    if (current !== next) text.nodeValue = next;
  });
  document.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title]').forEach((element) => {
    ['placeholder', 'aria-label', 'title'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const key = `data-f2f-${attribute}`;
      const source = element.getAttribute(key) ?? value;
      if (!element.hasAttribute(key)) element.setAttribute(key, source);
      const next = language === 'en' ? source : translateText(source, language);
      if (value !== next) element.setAttribute(attribute, next);
    });
  });
  document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
}

type LanguageContextValue = {
  language: Language;
  isHindi: boolean;
  toggleLanguage: () => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function TranslationLayer({ children, language }: { children: ReactNode; language: Language }) {
  useEffect(() => {
    let scheduled = false;
    const apply = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        translateDom(language);
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
  return <>{children}</>;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('farm2fork-language') as Language) || 'en');
  const value = useMemo<LanguageContextValue>(() => ({
    language,
    isHindi: language === 'hi',
    toggleLanguage: () => setLanguage((current) => {
      const next = current === 'hi' ? 'en' : 'hi';
      localStorage.setItem('farm2fork-language', next);
      return next;
    }),
    t: (key) => dictionaries[language][key] ?? key,
  }), [language]);
  return <LanguageContext.Provider value={value}><TranslationLayer language={language}>{children}</TranslationLayer></LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}