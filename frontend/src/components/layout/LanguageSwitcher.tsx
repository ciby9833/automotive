'use client';

import { Select } from 'antd';
import { useTranslation } from '@/i18n/useTranslation';
import { LOCALE_LABELS } from '@/i18n/translations';
import type { Locale } from '@/i18n/store';

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  return (
    <Select
      style={{ width: 140, marginRight: 16 }}
      value={locale}
      onChange={(value: Locale) => setLocale(value)}
      options={(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => ({
        value: l,
        label: LOCALE_LABELS[l],
      }))}
    />
  );
}
