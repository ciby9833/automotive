import type { Locale } from '@/i18n/store';
import type { Currency } from '@/lib/api/organizations';

const INTL_LOCALE: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  id: 'id-ID',
};

// IDR/VND 传统上不使用小数位，其余东南亚币种保留2位，和后端 CURRENCY_DECIMALS 保持一致
const CURRENCY_DECIMALS: Record<Currency, number> = {
  IDR: 0,
  MYR: 2,
  THB: 2,
  VND: 0,
  PHP: 2,
};

export function formatCurrency(amount: string | number, currency: Currency, locale: Locale): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}
