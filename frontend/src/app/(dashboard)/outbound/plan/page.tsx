'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { DriverVehiclePicker } from '@/components/carriers/DriverVehiclePicker';
import {
  BlockedVinRow,
  OutboundOrderListRow,
  OutboundOrderVinDetail,
  VehicleTowType,
  outboundApi,
} from '@/lib/api/outbound';
import { Carrier, carriersApi } from '@/lib/api/carriers';
import { Customer, CustomerAddress, customersApi } from '@/lib/api/customers';
import { Yard, yardsApi } from '@/lib/api/yards';
import { useTranslation } from '@/i18n/useTranslation';
import { formatSlotCode } from '@/lib/slots';

function OutboundPlanInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get('orderId') ?? undefined;

  const [organizationsId, setOrganizationId] = useState<string>();
  const [customerId, setCustomerId] = useState<string>();
  const [outboundOrderId, setOutboundOrderId] = useState<string | undefined>(
    initialOrderId,
  );
  const [yardId, setYardId] = useState<string>();
  const [dealerCode, setDealerCode] = useState<string>();
  const [groupCode, setGroupCode] = useState<string>();
  const [filterTowType, setFilterTowType] = useState<VehicleTowType>();
  const [vinQuery, setVinQuery] = useState('');

  const [orders, setOrders] = useState<OutboundOrderListRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [pool, setPool] = useState<OutboundOrderVinDetail[]>([]);
  const [exceptions, setExceptions] = useState<BlockedVinRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [carrierId, setCarrierId] = useState<string>();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [towTypeOverride, setTowTypeOverride] = useState<VehicleTowType>();
  const [manualDealerId, setManualDealerId] = useState<string>();
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>(
    [],
  );
  const [customerWaybillCode, setCustomerWaybillCode] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    carriersApi
      .list()
      .then((items) =>
        setCarriers(items.filter((item) => item.status === 'ACTIVE')),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    Promise.all([
      outboundApi.listOrders({
        all: true,
        status: 'PENDING',
        organizationId: organizationsId,
      }),
      customersApi.list(organizationsId),
      yardsApi.list(organizationsId),
    ])
      .then(([orderResult, customerRows, yardRows]) => {
        setOrders(orderResult.items);
        setCustomers(customerRows.filter((item) => item.status === 'ACTIVE'));
        setYards(yardRows.filter((item) => item.isActive));
      })
      .catch(() => message.error(t('outbound.plan.referenceLoadFailed')));
  }, [organizationsId, t]);

  const queryParams = useMemo(
    () => ({
      organizationId: organizationsId,
      customerId,
      outboundOrderId,
      yardId,
      dealerCode,
      groupCode,
      towType: filterTowType,
      vin: vinQuery.trim() || undefined,
    }),
    [
      organizationsId,
      customerId,
      outboundOrderId,
      yardId,
      dealerCode,
      groupCode,
      filterTowType,
      vinQuery,
    ],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [poolRows, exceptionRows] = await Promise.all([
        outboundApi.listPlanPool(queryParams),
        outboundApi.listPlanExceptions({
          organizationId: queryParams.organizationId,
          customerId: queryParams.customerId,
          outboundOrderId: queryParams.outboundOrderId,
          yardId: queryParams.yardId,
          vin: queryParams.vin,
        }),
      ]);
      setPool(poolRows);
      setExceptions(exceptionRows);
      setSelectedIds((current) => {
        const visible = new Set(poolRows.map((row) => row.id));
        return current.filter((id) => visible.has(String(id)));
      });
    } catch {
      message.error(t('outbound.plan.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [queryParams, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetFilters = () => {
    setOrganizationId(undefined);
    setCustomerId(undefined);
    setOutboundOrderId(undefined);
    setYardId(undefined);
    setDealerCode(undefined);
    setGroupCode(undefined);
    setFilterTowType(undefined);
    setVinQuery('');
    setSelectedIds([]);
  };

  const selected = useMemo(
    () => pool.filter((row) => selectedIds.includes(row.id)),
    [pool, selectedIds],
  );
  const base = selected[0];
  const baseOrderId = base?.outboundOrderId ?? undefined;
  const baseYardId = base?.slot?.yard?.id;
  const baseDealerCode = base?.dealerCode ?? undefined;

  const isCompatible = useCallback(
    (row: OutboundOrderVinDetail) => {
      if (!base) return true;
      return (
        row.outboundOrderId === baseOrderId &&
        row.slot?.yard?.id === baseYardId &&
        row.dealerCode === baseDealerCode
      );
    },
    [base, baseOrderId, baseYardId, baseDealerCode],
  );

  const selectedCustomerId = base?.outboundOrder?.customerId;
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerAddresses([]);
      return;
    }
    customersApi
      .get(selectedCustomerId)
      .then((customer) =>
        setCustomerAddresses(
          (customer.addresses ?? []).filter(
            (address) => address.isActive && address.code,
          ),
        ),
      )
      .catch(() => setCustomerAddresses([]));
  }, [selectedCustomerId]);

  const autoMatchedDealer = useMemo(() => {
    if (!baseDealerCode) return null;
    const normalized = baseDealerCode.trim().toUpperCase();
    return (
      customerAddresses.find(
        (address) => address.code?.trim().toUpperCase() === normalized,
      ) ?? null
    );
  }, [baseDealerCode, customerAddresses]);
  const matchedDealer = useMemo(() => {
    if (!manualDealerId) return autoMatchedDealer;
    return (
      customerAddresses.find((address) => address.id === manualDealerId) ?? null
    );
  }, [manualDealerId, autoMatchedDealer, customerAddresses]);

  const inheritedTowType = useMemo(() => {
    const values = new Set(
      selected.map((row) => row.towType).filter(Boolean) as VehicleTowType[],
    );
    return values.size === 1 ? [...values][0] : undefined;
  }, [selected]);
  const effectiveTowType = towTypeOverride ?? inheritedTowType;

  const dealerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pool) {
      if (row.dealerCode)
        map.set(row.dealerCode, row.dealerName ?? row.dealerCode);
    }
    return [...map].map(([value, name]) => ({
      value,
      label: `${name} (${value})`,
    }));
  }, [pool]);
  const groupOptions = useMemo(
    () =>
      [
        ...new Set(
          pool.map((row) => row.groupCode).filter(Boolean) as string[],
        ),
      ].map((value) => ({ value, label: value })),
    [pool],
  );

  const validationError = useMemo(() => {
    if (!selected.length) return null;
    if (new Set(selected.map((row) => row.outboundOrderId)).size > 1)
      return t('outbound.plan.errMultiOrder');
    if (new Set(selected.map((row) => row.slot?.yard?.id)).size > 1)
      return t('outbound.plan.errMultiYard');
    if (new Set(selected.map((row) => row.dealerCode)).size > 1)
      return t('outbound.plan.errMultiDealer');
    if (!matchedDealer) return t('outbound.plan.errNoDealer');
    if (!carrierId) return t('outbound.plan.errNoCarrier');
    if (!driverId) return t('outbound.plan.errNoDriver');
    if (!vehicleId) return t('outbound.plan.errNoVehicle');
    if (!effectiveTowType) return t('outbound.plan.errNoTowType');
    return null;
  }, [
    selected,
    matchedDealer,
    carrierId,
    driverId,
    vehicleId,
    effectiveTowType,
    t,
  ]);

  const submit = async () => {
    if (
      validationError ||
      !selected.length ||
      !baseOrderId ||
      !matchedDealer ||
      !carrierId ||
      !driverId ||
      !vehicleId ||
      !effectiveTowType
    )
      return;
    setSubmitting(true);
    try {
      const result = await outboundApi.plan({
        outboundOrderId: baseOrderId,
        orderVinIds: selected.map((row) => row.id),
        carrierId,
        driverId,
        vehicleId,
        towType: effectiveTowType,
        destinationDealerId: matchedDealer.id,
        customerWaybillCode: customerWaybillCode || undefined,
        recipientName: recipientName || undefined,
        recipientPhone: recipientPhone || undefined,
        remark: remark || undefined,
      });
      message.success(
        t('outbound.plan.success', {
          waybillCode: result.waybillCode,
          n: selected.length,
        }),
      );
      setSelectedIds([]);
      setCarrierId(undefined);
      setDriverId(null);
      setVehicleId(null);
      setTowTypeOverride(undefined);
      setManualDealerId(undefined);
      setCustomerWaybillCode('');
      setRecipientName('');
      setRecipientPhone('');
      setRemark('');
      await reload();
    } catch (error) {
      const detail = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.plan.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('outbound.plan.title')}
        subtitle={t('outbound.plan.workbenchSubtitle')}
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
            {t('common.refresh')}
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <OrgFilter
            value={organizationsId}
            onChange={(value) => {
              setOrganizationId(value);
              setCustomerId(undefined);
              setOutboundOrderId(undefined);
              setYardId(undefined);
              setSelectedIds([]);
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('outbound.plan.filterCustomer')}
            style={{ width: 200 }}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value);
              setOutboundOrderId(undefined);
              setSelectedIds([]);
            }}
            options={customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            virtual={false}
            placeholder={t('outbound.plan.filterOutboundOrder')}
            style={{ width: 330 }}
            value={outboundOrderId}
            onChange={(value) => {
              setOutboundOrderId(value);
              setSelectedIds([]);
            }}
            options={orders
              .filter((order) => !customerId || order.customerId === customerId)
              .map((order) => ({
                value: order.id,
                label: `${order.orderCode}${order.customerOrderNo ? ` · ${order.customerOrderNo}` : ''} · ${order.customerName}`,
              }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('outbound.plan.filterYard')}
            style={{ width: 190 }}
            value={yardId}
            onChange={(value) => {
              setYardId(value);
              setSelectedIds([]);
            }}
            options={yards.map((yard) => ({
              value: yard.id,
              label: `${yard.name} (${yard.code})`,
            }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('outbound.plan.filterDealer')}
            style={{ width: 220 }}
            value={dealerCode}
            onChange={(value) => {
              setDealerCode(value);
              setSelectedIds([]);
            }}
            options={dealerOptions}
          />
          <Select
            allowClear
            placeholder={t('outbound.plan.towType')}
            style={{ width: 140 }}
            value={filterTowType}
            onChange={(value) => {
              setFilterTowType(value);
              setSelectedIds([]);
            }}
            options={['CC', 'TOWING', 'TANSYA'].map((value) => ({
              value,
              label: value,
            }))}
          />
          <Select
            allowClear
            placeholder={t('outbound.plan.filterGroup')}
            style={{ width: 130 }}
            value={groupCode}
            onChange={(value) => {
              setGroupCode(value);
              setSelectedIds([]);
            }}
            options={groupOptions}
          />
          <Input.Search
            allowClear
            placeholder={t('outbound.plan.searchVin')}
            style={{ width: 210 }}
            onSearch={(value) => {
              setVinQuery(value);
              setSelectedIds([]);
            }}
          />
          <Button onClick={resetFilters}>{t('common.reset')}</Button>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={17}>
          <Card
            title={t('outbound.plan.availablePool')}
            extra={
              <Space>
                <span>
                  {t('outbound.plan.availableCount', { n: pool.length })}
                </span>
                <Button
                  danger={exceptions.length > 0}
                  icon={<ExclamationCircleOutlined />}
                  onClick={() => setExceptionsOpen(true)}
                >
                  {t('outbound.plan.exceptionCount', { n: exceptions.length })}
                </Button>
              </Space>
            }
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={t('outbound.plan.poolHint')}
            />
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              dataSource={pool}
              scroll={{ x: 1200 }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                hideSelectAll: true,
                getCheckboxProps: (row) => ({
                  disabled: !isCompatible(row),
                  title: !isCompatible(row)
                    ? t('outbound.plan.incompatibleVin')
                    : undefined,
                }),
                onChange: (keys) => {
                  setSelectedIds(keys);
                  setTowTypeOverride(undefined);
                  setManualDealerId(undefined);
                },
              }}
              columns={[
                { title: 'VIN', dataIndex: 'vin', width: 180, fixed: 'left' },
                {
                  title: t('outbound.plan.order'),
                  width: 190,
                  render: (_, row) => (
                    <div>
                      <div>{row.outboundOrder?.orderCode ?? '-'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {row.outboundOrder?.customerOrderNo ?? '-'}
                      </div>
                    </div>
                  ),
                },
                {
                  title: t('outbound.plan.customer'),
                  width: 150,
                  render: (_, row) => row.outboundOrder?.customer?.name ?? '-',
                },
                {
                  title: t('outbound.plan.dealer'),
                  width: 170,
                  render: (_, row) => (
                    <div>
                      <div>{row.dealerName ?? '-'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {row.dealerCode ?? '-'}
                      </div>
                    </div>
                  ),
                },
                {
                  title: t('outbound.plan.tow'),
                  dataIndex: 'towType',
                  width: 95,
                  render: (value: string | null) =>
                    value ? <Tag color="blue">{value}</Tag> : '-',
                },
                {
                  title: t('outbound.plan.group'),
                  dataIndex: 'groupCode',
                  width: 90,
                  render: (value: string | null) =>
                    value ? <Tag color="purple">{value}</Tag> : '-',
                },
                {
                  title: t('outbound.plan.slot'),
                  width: 160,
                  render: (_, row) =>
                    row.slot ? (
                      <Tag color="green">
                        {row.slot.yard?.code}·{formatSlotCode(row.slot)}
                      </Tag>
                    ) : (
                      '-'
                    ),
                },
                {
                  title: t('outbound.plan.importedAt'),
                  width: 160,
                  render: (_, row) =>
                    row.outboundOrder?.createdAt
                      ? new Date(row.outboundOrder.createdAt).toLocaleString()
                      : '-',
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={7}>
          <Card title={t('outbound.plan.summary')}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div>
                {t('outbound.plan.selectedCount')}:{' '}
                <strong>{selected.length}</strong>
              </div>
              <div>
                {t('outbound.plan.selectedOrder')}:{' '}
                <strong>{base?.outboundOrder?.orderCode ?? '-'}</strong>
              </div>
              <div>
                {t('outbound.plan.summaryYard')}:{' '}
                {base?.slot?.yard
                  ? `${base.slot.yard.name} (${base.slot.yard.code})`
                  : '-'}
              </div>
            </Space>

            {selected.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Form layout="vertical">
                  <Form.Item
                    label={t('outbound.plan.destinationDealer')}
                    required
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder={t('outbound.plan.dealerSelectPlaceholder')}
                      value={manualDealerId ?? autoMatchedDealer?.id}
                      onChange={setManualDealerId}
                      options={customerAddresses.map((address) => ({
                        value: address.id,
                        label: `${address.dealerName} (${address.code})${address.region ? ` · ${address.region}` : ''}`,
                      }))}
                    />
                  </Form.Item>
                  {matchedDealer && (
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 6,
                        padding: 10,
                        marginBottom: 12,
                        fontSize: 12,
                      }}
                    >
                      <strong>{matchedDealer.dealerName}</strong>
                      <div style={{ color: '#64748b' }}>
                        {matchedDealer.address}
                      </div>
                    </div>
                  )}
                  {manualDealerId &&
                    manualDealerId !== autoMatchedDealer?.id && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message={t('outbound.plan.destinationOverridden', {
                          from:
                            autoMatchedDealer?.dealerName ??
                            baseDealerCode ??
                            '-',
                          to: matchedDealer?.dealerName ?? '-',
                        })}
                      />
                    )}

                  <Form.Item label={t('outbound.plan.carrier')} required>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder={t('outbound.plan.carrierPlaceholder')}
                      value={carrierId}
                      onChange={(value) => {
                        setCarrierId(value);
                        setDriverId(null);
                        setVehicleId(null);
                      }}
                      options={carriers.map((carrier) => ({
                        value: carrier.id,
                        label: `${carrier.name}${carrier.type === 'SELF_OWNED' ? ' (自营)' : ''}`,
                      }))}
                    />
                  </Form.Item>
                  <DriverVehiclePicker
                    carrierId={carrierId}
                    driverId={driverId}
                    vehicleId={vehicleId}
                    required
                    allowClear={false}
                    onChange={({
                      driverId: nextDriver,
                      vehicleId: nextVehicle,
                    }) => {
                      setDriverId(nextDriver);
                      setVehicleId(nextVehicle);
                    }}
                  />
                  <Form.Item
                    label={t('outbound.plan.towType')}
                    required
                    extra={
                      inheritedTowType
                        ? t('outbound.plan.towTypeInherited', {
                            type: inheritedTowType,
                          })
                        : t('outbound.plan.towTypeNeedsConfirm')
                    }
                  >
                    <Select
                      value={effectiveTowType}
                      onChange={setTowTypeOverride}
                      options={['CC', 'TOWING', 'TANSYA'].map((value) => ({
                        value,
                        label: value,
                      }))}
                    />
                  </Form.Item>
                  {towTypeOverride && towTypeOverride !== inheritedTowType && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={t('outbound.plan.towTypeOverridden', {
                        from: inheritedTowType ?? '-',
                        to: towTypeOverride,
                      })}
                    />
                  )}
                  <Form.Item label={t('outbound.plan.customerWaybillCode')}>
                    <Input
                      value={customerWaybillCode}
                      onChange={(event) =>
                        setCustomerWaybillCode(event.target.value)
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t('outbound.plan.recipientName')}>
                    <Input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder={matchedDealer?.contactName ?? undefined}
                    />
                  </Form.Item>
                  <Form.Item label={t('outbound.plan.recipientPhone')}>
                    <Input
                      value={recipientPhone}
                      onChange={(event) =>
                        setRecipientPhone(event.target.value)
                      }
                      placeholder={matchedDealer?.contactPhone ?? undefined}
                    />
                  </Form.Item>
                  <Form.Item label={t('outbound.plan.remark')}>
                    <Input.TextArea
                      rows={2}
                      value={remark}
                      onChange={(event) => setRemark(event.target.value)}
                    />
                  </Form.Item>
                </Form>
              </>
            )}

            {validationError && selected.length > 0 && (
              <Alert
                type="warning"
                message={validationError}
                style={{ marginBottom: 12 }}
              />
            )}
            <Button
              type="primary"
              block
              size="large"
              loading={submitting}
              disabled={!selected.length || !!validationError}
              onClick={submit}
            >
              {t('outbound.plan.submit', { n: selected.length })}
            </Button>
          </Card>
        </Col>
      </Row>

      <Drawer
        title={t('outbound.plan.exceptionTitle')}
        width={800}
        open={exceptionsOpen}
        onClose={() => setExceptionsOpen(false)}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('outbound.plan.exceptionHint')}
        />
        <Table
          rowKey="id"
          size="small"
          dataSource={exceptions}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'VIN', dataIndex: 'vin', width: 180 },
            {
              title: t('outbound.plan.order'),
              dataIndex: 'outboundOrderCode',
              width: 190,
            },
            {
              title: t('outbound.plan.customer'),
              dataIndex: 'customerName',
              width: 150,
            },
            {
              title: t('outbound.plan.blockedReason'),
              dataIndex: 'reason',
              render: (reason: BlockedVinRow['reason']) => {
                const labels = {
                  NOT_ARRIVED: t('outbound.plan.reasonNotArrived'),
                  NO_SLOT: t('outbound.plan.reasonNoSlot'),
                  MISSING_DEALER: t('outbound.plan.reasonMissingDealer'),
                };
                return <Tag color="orange">{labels[reason]}</Tag>;
              },
            },
            {
              title: t('outbound.plan.dealer'),
              render: (_, row) => row.dealerName ?? row.dealerCode ?? '-',
            },
            {
              title: t('outbound.plan.slot'),
              render: (_, row) =>
                row.slotCode
                  ? `${row.yardName ? `${row.yardName}·` : ''}${row.slotCode}`
                  : '-',
            },
          ]}
        />
      </Drawer>
    </div>
  );
}

export default function OutboundPlanPage() {
  return (
    <Suspense>
      <OutboundPlanInner />
    </Suspense>
  );
}
