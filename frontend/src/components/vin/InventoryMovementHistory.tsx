'use client';
import { Collapse, Descriptions, Space, Tag } from 'antd';
import { useTranslation } from '@/i18n/useTranslation';
import { InventoryMovementView, InventoryStateView } from '@/lib/api/yards';
import { AttachmentImages } from '@/components/evidence/SignedAttachments';
export function InventoryMovementHistory({
  movements,
}: {
  movements: InventoryMovementView[];
}) {
  const { t } = useTranslation();
  const state = (value: InventoryStateView | null) =>
    value && (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Descriptions
          size="small"
          column={1}
          items={[
            {
              key: 'position',
              label: t('yardOps.inventoryPosition'),
              children: t(`yardOps.${value.position}`),
            },
            {
              key: 'slot',
              label: t('vinInventory.slot'),
              children: value.slotCode ?? '—',
            },
            {
              key: 'entered',
              label: t('yardOps.enteredAt'),
              children: new Date(value.enteredAt).toLocaleString(),
            },
          ]}
        />
        {!!value.vehicle?.arrivalPhotoUrls?.length && (
          <AttachmentImages keys={value.vehicle.arrivalPhotoUrls} />
        )}
      </Space>
    );
  return (
    <Collapse
      items={movements.map((m) => ({
        key: m.id,
        label: (
          <Space wrap>
            <span>{t(`yardOps.movement.${m.kind}`)}</span>
            <span>{new Date(m.occurredAt).toLocaleString()}</span>
            <Tag>
              {m.delta > 0 ? '+' : ''}
              {m.delta}
            </Tag>
            <span>{m.operatorName ?? '—'}</span>
          </Space>
        ),
        children: (
          <Space direction="vertical" style={{ width: '100%' }}>
            {m.reason && (
              <div>
                {t('yardOps.reason')}: {m.reason}
              </div>
            )}
            {m.reference && (
              <div>
                {t('yardOps.reference')}: {m.reference}
              </div>
            )}
            <strong>{t('yardOps.before')}</strong>
            {state(m.beforeState) ?? '—'}
            <strong>{t('yardOps.after')}</strong>
            {state(m.afterState)}
          </Space>
        ),
      }))}
    />
  );
}
