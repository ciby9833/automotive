// PM2 进程管理配置
// 用法（在 /var/www/automotive_alms 目录下）：
//   pm2 start deploy/ecosystem.config.js
//   pm2 save
//   pm2 startup   # 让开机自启
module.exports = {
  apps: [
    {
      name: 'tms-backend',
      cwd: '/var/www/automotive_alms/backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/www/automotive_alms/logs/backend-out.log',
      error_file: '/var/www/automotive_alms/logs/backend-err.log',
      merge_logs: true,
      max_memory_restart: '512M',
    },
    {
      name: 'tms-frontend',
      cwd: '/var/www/automotive_alms/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3080 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/www/automotive_alms/logs/frontend-out.log',
      error_file: '/var/www/automotive_alms/logs/frontend-err.log',
      merge_logs: true,
      max_memory_restart: '512M',
    },
  ],
};
