import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 回单文件名修正：之前上传时 multer 按 latin1 解析文件名，中文名存成了乱码（如“1å…12.pdf”）。
 * 只处理全部字符都在 latin1 范围内、且按 UTF-8 重新解码合法的记录；解不开的保持原样。
 */
export class TransportDocumentNames1791000000000 implements MigrationInterface {
  name = 'TransportDocumentNames1791000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT id, file_name FROM transport_documents
                 WHERE file_name ~ '[\u0080-\u00ff]' AND file_name !~ '[^\u0001-\u00ff]'
        LOOP
          BEGIN
            UPDATE transport_documents
               SET file_name = convert_from(convert_to(r.file_name, 'LATIN1'), 'UTF8')
             WHERE id = r.id;
          EXCEPTION WHEN others THEN NULL; -- 不是 UTF-8 字节序列，说明本来就是 latin1 名字，不动
          END;
        END LOOP;
      END $$`);
  }

  async down(): Promise<void> {
    // 修正乱码不可逆，也没有回退的必要
  }
}
