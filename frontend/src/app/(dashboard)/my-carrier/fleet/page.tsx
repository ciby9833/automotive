'use client';

import { Alert } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { CarrierFleetPanel } from '@/components/carriers/CarrierFleetPanel';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';

// 承运商侧「司机 / 车辆管理」入口
// carrierId 从 session 的 externalContext 取；后端二次校验只允许自家
export default function MyCarrierFleetPage() {
  const { t } = useTranslation();
  const carrierId = useAuthStore((s) => s.externalContext?.carrierId);

  if (!carrierId) {
    return (
      <div>
        <PageHeader title={t('myCarrierFleet.title')} />
        <Alert type="warning" message={t('myCarrierFleet.notCarrierAccount')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('myCarrierFleet.title')}
        subtitle={t('myCarrierFleet.subtitle')}
      />
      <CarrierFleetPanel carrierId={carrierId} />
    </div>
  );
}
