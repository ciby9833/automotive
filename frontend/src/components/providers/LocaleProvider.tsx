'use client';

import { ConfigProvider } from 'antd';
import { useLocaleStore } from '@/i18n/store';
import { ANTD_LOCALES } from '@/i18n/antdLocale';

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  return <ConfigProvider locale={ANTD_LOCALES[locale]}>{children}</ConfigProvider>;
}
