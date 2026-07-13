// 机器可读错误码：前端 i18n 词典按 code 做翻译（见 frontend/src/i18n/locales/*.json 的 errors.* 命名空间）
export const ErrorCode = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  AUTH_RESET_TOKEN_INVALID: 'AUTH_RESET_TOKEN_INVALID',
} as const;
