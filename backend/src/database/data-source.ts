import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

// 仅供 TypeORM CLI 使用（migration:generate/run/revert）。运行时应用走 app.module.ts 里
// TypeOrmModule.forRootAsync 那份配置，两边的连接参数必须保持一致。
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'tms',
  password: process.env.DB_PASSWORD ?? 'tms',
  database: process.env.DB_DATABASE ?? 'tms',
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  // 每个 migration 单独包事务：允许个别 migration 用 transaction=false 跳过
  // (Postgres ALTER TYPE ADD VALUE 不能在事务里执行)
  migrationsTransactionMode: 'each',
});
