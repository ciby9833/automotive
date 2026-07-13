'use client';

import { useEffect, useMemo, useState } from 'react';
import { Descriptions, Empty, Image, Spin, Tag } from 'antd';
import { fetchSignedUrls } from '@/lib/api/storage';

// 一台车两次扫描留下的凭证 (提货 + 入库) 复用同一组件展示
// 不做任何请求编排，只接收结构化数据 + MinIO key，自负责换取签名 URL

export interface EvidenceSectionData {
  // section 头部
  title: string;
  emptyText: string;

  // 事实字段：不同 section 传不同项
  facts: Array<{ label: string; value: React.ReactNode }>;

  // 存储层留的 object keys；组件内部换取签名 URL
  photoKeys: string[] | null;

  // 可选的车检信息展示
  checkInfo?: Record<string, string | number> | null;

  remark?: string | null;
}

interface Props {
  sections: EvidenceSectionData[];
}

// 统一从 sections 抽出所有 photo key 一次性请求签名 URL，避免每 section N 次请求
function useSignedUrls(keys: string[]): { map: Record<string, string>; loading: boolean } {
  const dedupedKeys = useMemo(() => Array.from(new Set(keys)), [keys]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dedupedKeys.length === 0) {
      // 首次挂载 map 已是 {}；这里不重置也不会显示旧图（Drawer destroyOnClose）
      return;
    }
    setLoading(true);
    let cancelled = false;
    fetchSignedUrls(dedupedKeys)
      .then((res) => {
        if (!cancelled) setMap(res);
      })
      .catch(() => {
        if (!cancelled) setMap({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupedKeys.join('|')]);

  return { map, loading };
}

export function EvidenceViewer({ sections }: Props) {
  const allKeys = useMemo(
    () => sections.flatMap((s) => s.photoKeys ?? []),
    [sections],
  );
  const { map, loading } = useSignedUrls(allKeys);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sections.map((s, idx) => {
        const empty =
          s.facts.every((f) => !f.value) &&
          (!s.photoKeys || s.photoKeys.length === 0) &&
          !s.remark &&
          (!s.checkInfo || Object.keys(s.checkInfo).length === 0);

        return (
          <section
            key={idx}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 16,
              background: '#fff',
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: '#0f172a',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {s.title}
            </div>

            {empty ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={s.emptyText}
              />
            ) : (
              <>
                <Descriptions column={2} size="small" style={{ marginBottom: 12 }}>
                  {s.facts.map((f, i) => (
                    <Descriptions.Item key={i} label={f.label}>
                      {f.value ?? <span style={{ color: '#94a3b8' }}>-</span>}
                    </Descriptions.Item>
                  ))}
                </Descriptions>

                {s.checkInfo && Object.keys(s.checkInfo).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {Object.entries(s.checkInfo).map(([k, v]) => (
                      <Tag key={k} color="blue" style={{ marginBottom: 4 }}>
                        {k}: {String(v)}
                      </Tag>
                    ))}
                  </div>
                )}

                {s.remark && (
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '8px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#475569',
                      marginBottom: 12,
                    }}
                  >
                    {s.remark}
                  </div>
                )}

                {s.photoKeys && s.photoKeys.length > 0 && (
                  <Spin spinning={loading}>
                    <Image.PreviewGroup>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {s.photoKeys.map((k, i) => (
                          <Image
                            key={k}
                            src={map[k]}
                            alt={`${s.title} ${i + 1}`}
                            width={96}
                            height={96}
                            style={{ objectFit: 'cover', borderRadius: 4 }}
                            fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5NiA5NiI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2YxZjVmOSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOTRhM2I4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+bm8gaW1hZ2U8L3RleHQ+PC9zdmc+"
                          />
                        ))}
                      </div>
                    </Image.PreviewGroup>
                  </Spin>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
