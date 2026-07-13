export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  cors: {
    // 逗号分隔的允许来源列表；生产环境必须显式配置 CORS_ORIGIN，不要用 "*" 或 true 允许任意来源
    origins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'tms',
    password: process.env.DB_PASSWORD ?? 'tms',
    database: process.env.DB_DATABASE ?? 'tms',
    // 默认关闭：生产/预发环境必须通过 `npm run migration:run` 管理schema，
    // 本地开发如需快速迭代可在 .env 里显式设置 DB_SYNCHRONIZE=true
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'minio', // minio | s3 | oss
    endPoint: process.env.STORAGE_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.STORAGE_PORT ?? '9000', 10),
    useSSL: (process.env.STORAGE_USE_SSL ?? 'false') === 'true',
    accessKey: process.env.STORAGE_ACCESS_KEY ?? 'tmsadmin',
    secretKey: process.env.STORAGE_SECRET_KEY ?? 'tmsadmin123',
    bucket: process.env.STORAGE_BUCKET ?? 'tms-files',
  },
  email: {
    // 企业现有SMTP服务器配置；本地开发不填时邮件模块只打印日志、不真实发信
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    fromName: process.env.SMTP_FROM_NAME ?? '汽车物流TMS',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? '',
  },
  // 找回密码等邮件里拼重置链接用，需配置成前端实际访问地址
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
});
