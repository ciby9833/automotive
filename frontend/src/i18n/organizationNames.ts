import type { Locale } from "./store";

// 仅翻译预置国家名称；总部维护过的自定义名称始终以数据库值为准。
const COUNTRY_NAMES: Record<string, Record<Locale, string>> = {
  ID: { zh: "印度尼西亚", en: "Indonesia", id: "Indonesia" },
  MY: { zh: "马来西亚", en: "Malaysia", id: "Malaysia" },
  TH: { zh: "泰国", en: "Thailand", id: "Thailand" },
  VN: { zh: "越南", en: "Vietnam", id: "Vietnam" },
  PH: { zh: "菲律宾", en: "Philippines", id: "Filipina" },
};

export function localizedOrganizationName(
  code: string,
  fallbackName: string,
  locale: Locale,
): string {
  const names = COUNTRY_NAMES[code];
  return names && Object.values(names).includes(fallbackName)
    ? names[locale]
    : fallbackName;
}
