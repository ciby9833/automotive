import { DataSource, MigrationExecutor } from 'typeorm';

// 在 app.listen() 前校验，避免旧库启动定时任务并对外提供不完整的业务服务。
export async function checkMigrations(dataSource: DataSource): Promise<void> {
  if (dataSource.migrations.length === 0) {
    throw new Error('未加载数据库迁移文件，请检查后端构建产物。');
  }
  const pending = await new MigrationExecutor(dataSource).getPendingMigrations();
  if (pending.length > 0) {
    throw new Error(
      `数据库存在未执行的迁移：${pending.map((m) => m.name).join(', ')}。` +
        '请先备份数据库，在 backend 目录执行 npm run migration:run，成功后重新启动后端。',
    );
  }
}
