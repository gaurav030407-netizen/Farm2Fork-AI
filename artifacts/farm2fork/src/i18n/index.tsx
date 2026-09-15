import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import hi from './hi.json';

export type Language =
  | 'en'
  | 'hi'
  | 'bn'
  | 'te'
  | 'mr'
  | 'ta'
  | 'gu'
  | 'ur'
  | 'kn'
  | 'or'
  | 'ml'
  | 'pa'
  | 'as'
  | 'mai'
  | 'sa'
  | 'ks'
  | 'ne'
  | 'kok'
  | 'sd'
  | 'doi'
  | 'mni'
  | 'brx'
  | 'sat';

export interface LanguageMeta {
  code: Language;
  name: string;
  nativeName: string;
  status: 'available' | 'in_progress';
}

export const INDIAN_LANGUAGES: LanguageMeta[] = [
  { code: 'en', name: 'English', nativeName: 'English', status: 'available' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', status: 'available' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', status: 'in_progress' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', status: 'in_progress' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', status: 'in_progress' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', status: 'in_progress' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', status: 'in_progress' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', status: 'in_progress' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', status: 'in_progress' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', status: 'in_progress' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', status: 'in_progress' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', status: 'in_progress' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', status: 'in_progress' },
  { code: 'mai', name: 'Maithili', nativeName: 'मैथिली', status: 'in_progress' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', status: 'in_progress' },
  { code: 'ks', name: 'Kashmiri', nativeName: 'کٲشُر', status: 'in_progress' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', status: 'in_progress' },
  { code: 'kok', name: 'Konkani', nativeName: 'कोंकणी', status: 'in_progress' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', status: 'in_progress' },
  { code: 'doi', name: 'Dogri', nativeName: 'डोगरी', status: 'in_progress' },
  { code: 'mni', name: 'Manipuri', nativeName: 'মৈতৈলোন্', status: 'in_progress' },
  { code: 'brx', name: 'Bodo', nativeName: 'बर’', status: 'in_progress' },
  { code: 'sat', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', status: 'in_progress' },
];

type Dictionary = Record<string, string>;
const dictionaries: Partial<Record<Language, Dictionary>> = { en, hi };
const originalText = new WeakMap<Text, string>();

function translateText(value: string, language: Language) {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.slice(leading.length, value.length - trailing.length || undefined);
  if (!core) return value;
  const dictionary = dictionaries[language];
  if (!dictionary) return value;
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
    const next = language === 'en' || !dictionaries[language] ? source : translateText(source, language);
    if (current !== next) text.nodeValue = next;
  });
  document.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title]').forEach((element) => {
    ['placeholder', 'aria-label', 'title'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const key = `data-f2f-${attribute}`;
      const source = element.getAttribute(key) ?? value;
      if (!element.hasAttribute(key)) element.setAttribute(key, source);
      const next = language === 'en' || !dictionaries[language] ? source : translateText(source, language);
      if (value !== next) element.setAttribute(attribute, next);
    });
  });
  document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
}

type LanguageContextValue = {
  language: Language;
  isHindi: boolean;
  setLanguage: (lang: Language) => void;
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
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('farm2fork-language');
    if (saved && INDIAN_LANGUAGES.some((l) => l.code === saved)) {
      return saved as Language;
    }
    return 'en';
  });

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem('farm2fork-language', next);
  };

  const toggleLanguage = () => {
    const next = language === 'hi' ? 'en' : 'hi';
    setLanguage(next);
  };

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    isHindi: language === 'hi',
    setLanguage,
    toggleLanguage,
    t: (key) => dictionaries[language]?.[key] ?? dictionaries.en?.[key] ?? key,
  }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      <TranslationLayer language={language}>{children}</TranslationLayer>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}