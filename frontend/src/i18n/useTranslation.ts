'use client';

import { useCallback } from 'react';
import { useLocaleStore } from './store';
import { translate } from './translations';

export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
  return { t, locale, setLocale };
}
