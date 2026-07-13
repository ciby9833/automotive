export enum Currency {
  IDR = 'IDR', // 印尼盾
  MYR = 'MYR', // 马来西亚林吉特
  THB = 'THB', // 泰铢
  VND = 'VND', // 越南盾
  PHP = 'PHP', // 菲律宾比索
}

// 显示用小数位：IDR/VND 传统上不使用小数，其余用2位
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  [Currency.IDR]: 0,
  [Currency.MYR]: 2,
  [Currency.THB]: 2,
  [Currency.VND]: 0,
  [Currency.PHP]: 2,
};
