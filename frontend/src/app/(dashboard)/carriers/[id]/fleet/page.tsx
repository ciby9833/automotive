'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Result } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { CarrierFleetPanel } from '@/components/carriers/CarrierFleetPanel';
import { carriersApi, type Carrier } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

/** 某个供应商的司机 / 车辆，作为工作台标签页打开（原来是 960px 抽屉，窄屏会被截掉） */
export function CarrierFleetDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    carriersApi
      .get(id)
      .then(setCarrier)
      .catch(() => setFailed(true));
  }, [id]);

  if (failed) return <Result status="404" title={t('carriers.loadFailed')} />;
  return (
    <div>
      <PageHeader title={carrier ? `${carrier.name}${carrier.shortName ? ` · ${carrier.shortName}` : ''}` : '…'} />
      <CarrierFleetPanel carrierId={id} carrierName={carrier?.name} />
    </div>
  );
}

export default function CarrierFleetPage() {
  const params = useParams<{ id: string }>();
  return <CarrierFleetDetail id={params.id} />;
}
