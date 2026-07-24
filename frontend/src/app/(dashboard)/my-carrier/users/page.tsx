'use client';

import { Alert } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { CarrierUsersPanel } from '@/components/carriers/CarrierUsersPanel';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';

// 承运商侧「账号管理」入口
// carrierId 从 session 的 externalContext 取；后端会二次校验只放自家
// UI 与 HQ/ORG 侧一模一样，复用 CarrierUsersPanel
export default function MyCarrierUsersPage() {
  const { t } = useTranslation();
  const carrierId = useAuthStore((s) => s.externalContext?.carrierId);
  const role = useAuthStore((s) => s.user?.role);

  if (!carrierId) {
    return (
      <div>
        <PageHeader title={t('myCarrierUsers.title')} />
        <Alert type="warning" message={t('myCarrierUsers.notCarrierAccount')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('myCarrierUsers.title')}
        subtitle={t('myCarrierUsers.subtitle')}
      />
      {role !== 'CARRIER_STAFF' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('myCarrierUsers.driverHint')}
        />
      )}
      <CarrierUsersPanel carrierId={carrierId} />
    </div>
  );
}
