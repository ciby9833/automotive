import type { Locale } from './store';

// 国家名称的多语言映射：后端 Organization.name 只存一个语言（通常是中文录入），
// 前端按 ISO 国家码做展示层翻译，找不到的码直接回退显示后端原始 name
const COUNTRY_NAMES: Record<string, Record<Locale, string>> = {
  ID: { zh: '印度尼西亚', en: 'Indonesia', id: 'Indonesia' },
  MY: { zh: '马来西亚', en: 'Malaysia', id: 'Malaysia' },
  TH: { zh: '泰国', en: 'Thailand', id: 'Thailand' },
  VN: { zh: '越南', en: 'Vietnam', id: 'Vietnam' },
  PH: { zh: '菲律宾', en: 'Philippines', id: 'Filipina' },
};

export function localizedOrganizationName(code: string, fallbackName: string, locale: Locale): string {
  return COUNTRY_NAMES[code]?.[locale] ?? fallbackName;
}
