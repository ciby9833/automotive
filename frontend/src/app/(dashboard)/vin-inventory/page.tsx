'use client';

import { useEffect, useState } from 'react';
import { Button, Input, InputNumber, Space, Table, Tag, message } from 'antd';
import { useRouter } from 'next/navigation';
import { EnvironmentOutlined } from '@ant-design/icons';
import { yardsApi, VinInventoryRow } from '@/lib/api/yards';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { OrgFilter } from '@/components/layout/OrgFilter';

// VIN 库存查询：以 VIN 为主视角，回答"这辆车现在在哪、几天了、什么车型、哪张订单"
// 点击行的"定位到看板"按钮 → 跳转 /yards?yardId=X&highlightVin=Y，看板打开对应场地并高亮
export default function VinInventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VinInventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [vinFilter, setVinFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [minStayDays, setMinStayDays] = useState<number | null>(null);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { t } = useTranslation();

  const load = async () => {
    setLoading(true);
    try {
      const list = await yardsApi.vinInventory({
        vin: vinFilter.trim() || undefined,
        organizationId: orgFilter,
        minStayDays: minStayDays ?? undefined,
      });
      setRows(list);
    } catch {
      message.error(t('vinInventory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter, minStayDays]);

  const locateOnBoard = (row: VinInventoryRow) => {
    // 跳转到场地看板并让它高亮这辆车所在的库位
    router.push(`/yards?yardId=${row.yardId}&highlightVin=${encodeURIComponent(row.vin)}`);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('vinInventory.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        <Space>
          <Input.Search
            allowClear
            style={{ width: 260 }}
            placeholder={t('vinInventory.vinPlaceholder')}
            value={vinFilter}
            onChange={(e) => setVinFilter(e.target.value)}
            onSearch={load}
          />
          <span style={{ color: '#64748b' }}>{t('vinInventory.minStayDays')}</span>
          <InputNumber
            min={0}
            max={365}
            style={{ width: 80 }}
            value={minStayDays}
            onChange={(v) => setMinStayDays(v)}
            placeholder="0"
          />
        </Space>
      </div>

      <Table
        rowKey="slotId"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'VIN', dataIndex: 'vin', width: 200 },
          { title: t('vinInventory.model'), dataIndex: 'model', render: (v) => v ?? '-' },
          { title: t('vinInventory.color'), dataIndex: 'color', render: (v) => v ?? '-' },
          { title: t('vinInventory.vehicleType'), dataIndex: 'vehicleType', render: (v) => v ?? '-' },
          { title: t('vinInventory.yard'), render: (_, r) => `${r.yardName} (${r.yardCode})` },
          {
            title: t('vinInventory.slot'),
            dataIndex: 'slotCode',
            render: (v: string) => <Tag color="green">{v}</Tag>,
          },
          {
            title: t('vinInventory.stayDays'),
            dataIndex: 'stayDays',
            width: 120,
            render: (n: number) => (
              <Tag color={n >= 30 ? 'red' : n >= 14 ? 'orange' : 'default'}>
                {t('vinInventory.days', { n })}
              </Tag>
            ),
            sorter: (a, b) => a.stayDays - b.stayDays,
          },
          {
            title: t('vinInventory.orderCode'),
            dataIndex: 'orderCode',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('vinInventory.action'),
            width: 140,
            render: (_, r) => (
              <Button
                size="small"
                icon={<EnvironmentOutlined />}
                onClick={() => locateOnBoard(r)}
              >
                {t('vinInventory.locate')}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
