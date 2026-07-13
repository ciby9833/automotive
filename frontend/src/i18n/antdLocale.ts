import type { Locale as AntdLocale } from 'antd/es/locale';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import idID from 'antd/locale/id_ID';
import type { Locale } from './store';

// antd内置组件(分页/Modal按钮文案/空状态等)走antd自带的locale包，
// 不需要我们在词典里重复翻译一遍
export const ANTD_LOCALES: Record<Locale, AntdLocale> = {
  zh: zhCN,
  en: enUS,
  id: idID,
};
