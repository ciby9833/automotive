import zh from './locales/zh.json';
import en from './locales/en.json';
import id from './locales/id.json';
import type { Locale } from './store';

export const DICTIONARIES: Record<Locale, Record<string, unknown>> = { zh, en, id };

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  id: 'Bahasa Indonesia',
};

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

// 找不到的key会兜底回退到中文词典，再兜底显示key本身，避免因缺翻译导致页面报错/空白
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const value =
    getByPath(DICTIONARIES[locale], key) ?? getByPath(DICTIONARIES.zh, key) ?? key;
  let text = typeof value === 'string' ? value : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
