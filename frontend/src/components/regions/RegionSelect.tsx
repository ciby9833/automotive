'use client';

import { useEffect, useMemo, useState } from 'react';
import { TreeSelect } from 'antd';
import { regionsApi, type Region } from '@/lib/api/regions';
import { useTranslation } from '@/i18n/useTranslation';

type Node = { value: string; title: string; children?: Node[] };

// 同一机构的区域只拉一次，地址簿、报价弹窗共用
const cache = new Map<string, Promise<{ country: string | null; items: Region[] }>>();

export function useRegions(organizationId: string | undefined) {
  const [data, setData] = useState<{ org: string; country: string | null; items: Region[] } | null>(null);
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    let p = cache.get(organizationId);
    if (!p) {
      p = regionsApi.list(organizationId);
      cache.set(organizationId, p);
      p.catch(() => cache.delete(organizationId));
    }
    p.then((r) => {
      if (!cancelled) setData({ org: organizationId, ...r });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [organizationId]);
  return data?.org === organizationId ? data : null;
}

/** 区域显示名：县/市带上省，便于区分同名 */
export function regionLabel(regions: Region[], id: string | null | undefined): string {
  const r = regions.find((x) => x.id === id);
  if (!r) return '';
  const parent = r.parent_id ? regions.find((x) => x.id === r.parent_id) : undefined;
  return parent ? `${r.name} · ${parent.name}` : r.name;
}

/** 省/州 → 县/市 两级树；旧数据迁移来的自定义区域放在最后 */
export function RegionSelect({
  organizationId,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  organizationId: string | undefined;
  value?: string | null;
  onChange?: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const data = useRegions(organizationId);
  const tree = useMemo(() => {
    const items = data?.items ?? [];
    const children = new Map<string, Node[]>();
    for (const r of items)
      if (r.parent_id)
        children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), { value: r.id, title: r.name }]);
    const roots = items.filter((r) => !r.parent_id);
    return [
      ...roots
        .filter((r) => r.is_system)
        .map((r) => ({ value: r.id, title: r.name, children: children.get(r.id) })),
      ...roots
        .filter((r) => !r.is_system)
        .map((r) => ({ value: r.id, title: `${r.name}（${t('regions.custom')}）` })),
    ];
  }, [data, t]);
  return (
    <TreeSelect
      allowClear
      showSearch
      treeNodeFilterProp="title"
      value={value ?? undefined}
      onChange={(v) => onChange?.((v as string | undefined) ?? null)}
      treeData={tree}
      disabled={disabled || !organizationId}
      placeholder={data && !data.country ? t('regions.noCountry') : placeholder}
      notFoundContent={data && !data.country ? t('regions.noCountry') : undefined}
      popupMatchSelectWidth={false}
      style={{ width: '100%' }}
    />
  );
}
