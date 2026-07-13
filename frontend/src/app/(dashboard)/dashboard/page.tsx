'use client';

import { Card, Col, Row, Statistic } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';

// P0阶段占位总览：接口打通后按角色补充真实统计口径(待处理运单数/在库车辆数/待对账金额等)
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const option = {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: [t('transportType.TRANSFER'), t('transportType.REALLOCATION'), t('transportType.DELIVERY')],
    },
    yAxis: { type: 'value' },
    series: [{ data: [0, 0, 0], type: 'bar' }],
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>
        {t('dashboard.welcome', {
          name: user?.displayName ?? '',
          role: user ? t(`roles.${user.role}`) : '',
        })}
      </h2>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title={t('dashboard.notArrivedWaybills')} value={0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title={t('dashboard.inTransitWaybills')} value={0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title={t('dashboard.pendingReconciliation')} value={0} prefix="¥" />
          </Card>
        </Col>
      </Row>
      <Card title={t('dashboard.waybillTypeDistribution')}>
        <ReactECharts option={option} style={{ height: 320 }} />
      </Card>
    </div>
  );
}
