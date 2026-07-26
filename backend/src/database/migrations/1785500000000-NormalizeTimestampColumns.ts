import { MigrationInterface, QueryRunner } from 'typeorm';

// 一次性列名归一化：把 public schema 里所有 "createdAt"/"updatedAt" 列 rename 成
// snake_case (created_at/updated_at)。
//
// 历史背景：早期 synchronize=true 让 TypeORM 用 entity property 名 (camelCase) 建表；
// 后来 BaseEntity 显式加了 @CreateDateColumn({name:'created_at'})，新表用 snake_case。
// 结果 prod 库有些老表列名是 "createdAt"，新表是 "created_at"。ORM 走 metadata 映射
// 两边都通，但 raw SQL 一碰即崩（如 1785000000000 那次 UPDATE）。
//
// 本 migration：dev 库全 snake_case → 无 camelCase 匹配 → 自动 no-op；
// prod 库有多少改多少，一次搬齐，以后 raw SQL 只写一种。
export class NormalizeTimestampColumns1785500000000
  implements MigrationInterface
{
  name = 'NormalizeTimestampColumns1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 动态扫 + 逐个 rename，用 EXECUTE format 避免拼接注入
    // 遇到同表已存在目标列名（罕见：曾手改一半）就跳过并 RAISE NOTICE
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
        target_name TEXT;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('createdAt', 'updatedAt')
        LOOP
          target_name := CASE r.column_name
            WHEN 'createdAt' THEN 'created_at'
            WHEN 'updatedAt' THEN 'updated_at'
          END;
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = r.table_name
              AND column_name = target_name
          ) THEN
            RAISE NOTICE 'skip % : both % and % exist, manual review needed',
              r.table_name, r.column_name, target_name;
          ELSE
            EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I',
              r.table_name, r.column_name, target_name);
            RAISE NOTICE 'renamed %.% -> %', r.table_name, r.column_name, target_name;
          END IF;
        END LOOP;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // 不提供 down：这是数据归一动作，回滚等于把 prod 打回混乱状态。
    // 如果真需要回滚，请手动 ALTER TABLE ... RENAME COLUMN 目标列。
    throw new Error(
      'NormalizeTimestampColumns is intentionally irreversible; ' +
        'manually rename columns if you must roll back.',
    );
  }
}
