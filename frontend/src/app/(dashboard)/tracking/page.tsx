'use client';

import { useState } from 'react';
import { Button, Input, Space, Table, message } from 'antd';
import { trackingApi, WaybillStatusLog } from '@/lib/api/tracking';
import { useTranslation } from '@/i18n/useTranslation';

// 按VIN查询该车辆从入库到出库的完整审计日志(轨迹跟踪)
export default function TrackingPage() {
  const [vin, setVin] = useState('');
  const [logs, setLogs] = useState<WaybillStatusLog[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const search = async () => {
    if (!vin) return;
    setLoading(true);
    try {
      setLogs(await trackingApi.byVin(vin));
    } catch {
      setLogs([]);
      message.warning(t('tracking.notFound'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('tracking.title')}</h2>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder={t('tracking.placeholder')}
          value={vin}
          onChange={(e) => setVin(e.target.value)}
          onPressEnter={search}
          style={{ width: 280 }}
        />
        <Button type="primary" onClick={search}>
          {t('tracking.search')}
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={logs}
        columns={[
          { title: t('tracking.time'), dataIndex: 'createdAt' },
          {
            title: t('tracking.action'),
            dataIndex: 'action',
            render: (v: string) => t(`scanAction.${v}`),
          },
          { title: t('tracking.yard'), dataIndex: 'yardId' },
          { title: t('tracking.remark'), dataIndex: 'remark' },
        ]}
      />
    </div>
  );
}
