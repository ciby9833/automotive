'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  message,
  Modal,
  Select,
  Space,
  Tag,
} from 'antd';
import {
  CarOutlined,
  EnvironmentOutlined,
  EditOutlined,
  PhoneOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { waybillsApi, type Waybill } from '@/lib/api/waybills';
import { carriersApi, type Driver, type Vehicle } from '@/lib/api/carriers';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  waybill: Waybill | null;
  onClose: () => void;
  onSaved?: () => void;
}

// 运单详情抽屉：展示司机/承运商/拖车/经销店全部联系方式，供业务员核对
export function WaybillDetailDrawer({ waybill, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const userRole = useAuthStore((s) => s.user?.role);
  const userCarrierId = useAuthStore((s) => s.externalContext?.carrierId);

  // 分派权限：HQ/ORG_ADMIN 全通；CARRIER_STAFF 仅自己承接的运单
  // 且必须 NOT_ARRIVED + 未锁定，与后端校验对齐
  const canAssign =
    !!waybill &&
    waybill.status === 'NOT_ARRIVED' &&
    !waybill.isLocked &&
    (userRole === 'HQ_ADMIN' ||
      userRole === 'ORG_ADMIN' ||
      (userRole === 'CARRIER_STAFF' && userCarrierId === waybill.carrierId));

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm] = Form.useForm();
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    if (!assignOpen || !waybill?.carrierId) return;
    carriersApi.listDrivers(waybill.carrierId).then(setDrivers).catch(() => setDrivers([]));
    carriersApi.listVehicles(waybill.carrierId).then(setVehicles).catch(() => setVehicles([]));
    assignForm.setFieldsValue({
      driverId: waybill.driver?.id ?? null,
      vehicleId: waybill.vehicle?.id ?? null,
    });
  }, [assignOpen, waybill?.carrierId, waybill?.driver?.id, waybill?.vehicle?.id, assignForm]);

  const submitAssign = async () => {
    if (!waybill) return;
    const values = (await assignForm.validateFields()) as {
      driverId?: string | null;
      vehicleId?: string | null;
    };
    setAssignSubmitting(true);
    try {
      await waybillsApi.assign(waybill.id, {
        driverId: values.driverId ?? null,
        vehicleId: values.vehicleId ?? null,
      });
      message.success(t('waybills.detail.assignOk'));
      setAssignOpen(false);
      onSaved?.();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('waybills.detail.assignFailed'));
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <Drawer
      title={
        waybill
          ? `${t('waybills.detail.title')} · ${waybill.waybillCode}`
          : t('waybills.detail.title')
      }
      open={!!waybill}
      onClose={onClose}
      width={720}
      destroyOnClose
    >
      {waybill && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 基本信息 */}
          <section style={cardStyle}>
            <Descriptions title={t('waybills.detail.basic')} column={2} size="small">
              <Descriptions.Item label={t('waybills.detail.transportType')}>
                <Tag>{t(`transportType.${waybill.transportType}`)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.status')}>
                <Tag
                  color={
                    waybill.status === 'ARRIVED'
                      ? 'green'
                      : waybill.status === 'IN_TRANSIT'
                        ? 'blue'
                        : 'default'
                  }
                >
                  {t(`waybillStatus.${waybill.status}`)}
                </Tag>
                {waybill.isLocked && (
                  <Tag color="red">{t('waybills.isLocked')}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.customerWaybillCode')}>
                {waybill.customerWaybillCode ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.vinCount')}>
                {waybill.vins.length}
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.originYard')}>
                {waybill.originYard?.name ?? waybill.originText ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.towType')}>
                {waybill.towType ? <Tag color="blue">{waybill.towType}</Tag> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.remark')} span={2}>
                {waybill.remark ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </section>

          {/* 承运商 · 司机 · 拖车 */}
          <section style={cardStyle}>
            <div
              style={{
                ...sectionTitle,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{t('waybills.detail.carrierInfo')}</span>
              {canAssign && (
                <Button
                  size="small"
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => setAssignOpen(true)}
                >
                  {t('waybills.detail.assign')}
                </Button>
              )}
            </div>
            <Descriptions column={2} size="small">
              <Descriptions.Item
                label={
                  <>
                    <ShopOutlined /> {t('waybills.detail.carrier')}
                  </>
                }
              >
                {waybill.carrier?.name ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <>
                    <PhoneOutlined /> {t('waybills.detail.carrierPhone')}
                  </>
                }
              >
                {waybill.carrier?.contactPhone ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <>
                    <UserOutlined /> {t('waybills.detail.driver')}
                  </>
                }
              >
                {waybill.driver?.name ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <>
                    <PhoneOutlined /> {t('waybills.detail.driverPhone')}
                  </>
                }
              >
                {waybill.driver?.phone ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('waybills.detail.licenseNo')}>
                {waybill.driver?.licenseNo ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <>
                    <CarOutlined /> {t('waybills.detail.plateNumber')}
                  </>
                }
              >
                {waybill.vehicle?.plateNumber ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </section>

          {/* 目的经销店 */}
          {waybill.destinationDealer && (
            <section style={cardStyle}>
              <div style={sectionTitle}>
                <EnvironmentOutlined /> {t('waybills.detail.destinationDealer')}
              </div>
              <Descriptions column={2} size="small">
                <Descriptions.Item
                  label={t('waybills.detail.dealerGroup')}
                  span={2}
                >
                  {waybill.destinationDealer.dealerGroup ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('waybills.detail.dealerName')} span={2}>
                  <strong>{waybill.destinationDealer.dealerName}</strong>
                </Descriptions.Item>
                <Descriptions.Item label={t('waybills.detail.dealerRegion')}>
                  {waybill.destinationDealer.region ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('waybills.detail.dealerCode')}>
                  {waybill.destinationDealer.code ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('waybills.detail.dealerPhone')}>
                  {waybill.destinationDealer.contactPhone ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('waybills.detail.dealerAddress')} span={2}>
                  {waybill.destinationDealer.address}
                </Descriptions.Item>
              </Descriptions>
            </section>
          )}

          {/* VIN 列表 */}
          <section style={cardStyle}>
            <div style={sectionTitle}>
              {t('waybills.detail.vinList')} ({waybill.vins.length})
            </div>
            <Space wrap>
              {waybill.vins.map((v) => (
                <Tag
                  key={v.id}
                  color={v.isSigned ? 'green' : 'default'}
                  style={{ fontSize: 12 }}
                >
                  {v.vin}
                  {v.isSigned && ' ✓'}
                </Tag>
              ))}
            </Space>
          </section>
        </div>
      )}

      <Modal
        title={t('waybills.detail.assignTitle')}
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        onOk={submitAssign}
        confirmLoading={assignSubmitting}
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical" preserve={false}>
          <Form.Item label={t('waybills.detail.driver')} name="driverId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('waybills.detail.driverPlaceholder')}
              options={drivers.map((d) => ({
                value: d.id,
                label: `${d.name}${d.phone ? ` · ${d.phone}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item label={t('waybills.detail.plateNumber')} name="vehicleId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('waybills.detail.vehiclePlaceholder')}
              options={vehicles.map((v) => ({
                value: v.id,
                label: `${v.plateNumber}${v.towType ? ` · ${v.towType}` : ''}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 16,
  background: '#fff',
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: '#0f172a',
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
