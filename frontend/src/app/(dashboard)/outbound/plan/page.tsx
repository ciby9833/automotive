'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  outboundApi,
  OutboundOrderListRow,
  OutboundOrderVinDetail,
  VehicleTowType,
} from '@/lib/api/outbound';
import { customersApi, Customer, CustomerAddress } from '@/lib/api/customers';
import { yardsApi, Yard } from '@/lib/api/yards';
import { carriersApi, Carrier } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

// 出库开单：从库存里选 VIN → 分配供应商 → 生成运单
// 业务规则：一张运单只能派往同一经销店 (后端校验，前端做同经销店过滤引导)
function OutboundPlanInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get('orderId') ?? undefined;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [outboundOrders, setOutboundOrders] = useState<OutboundOrderListRow[]>([]);
  const [available, setAvailable] = useState<OutboundOrderVinDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const [outboundOrderId, setOutboundOrderId] = useState<string | undefined>(
    initialOrderId,
  );
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [yardId, setYardId] = useState<string | undefined>();
  const [dealerCode, setDealerCode] = useState<string | undefined>();
  const [groupCode, setGroupCode] = useState<string | undefined>();

  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [carrierId, setCarrierId] = useState<string | undefined>();
  const [towType, setTowType] = useState<VehicleTowType | undefined>();
  const [customerWaybillCode, setCustomerWaybillCode] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 客户地址簿：按选中的 VIN 的 customerId 加载，用于展示门店信息 + 兜底填收件人
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  // 手动选门店：业务员可覆盖自动匹配（VIN dealer_code）指定别的门店
  const [manualDealerId, setManualDealerId] = useState<string | undefined>();

  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => undefined);
    yardsApi.list().then(setYards).catch(() => undefined);
    carriersApi.list().then(setCarriers).catch(() => undefined);
    outboundApi.listOrders().then(setOutboundOrders).catch(() => undefined);
  }, []);

  const reload = () => {
    setLoading(true);
    outboundApi
      .listAvailable({
        customerId,
        yardId,
        dealerCode,
        groupCode,
        outboundOrderId,
      })
      .then((rows) => {
        setAvailable(rows);
        // 过滤条件变了，之前选的 VIN 可能不在新列表里 — 只保留还在的
        setSelectedIds((prev) => {
          const nowIds = new Set(rows.map((r) => r.id));
          return prev.filter((k) => nowIds.has(String(k)));
        });
      })
      .catch(() => message.error(t('outbound.plan.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, yardId, dealerCode, groupCode, outboundOrderId]);

  // 从选中的 VIN 推导：经销店集合、始发仓集合
  const selected = useMemo(
    () => available.filter((v) => selectedIds.includes(v.id)),
    [available, selectedIds],
  );
  const dealerSet = useMemo(
    () =>
      new Set(
        selected
          .map((v) => v.dealerName ?? v.dealerCode)
          .filter(Boolean) as string[],
      ),
    [selected],
  );
  const yardSet = useMemo(
    () =>
      new Set(
        selected
          .map((v) => v.slot?.yard?.id)
          .filter(Boolean) as string[],
      ),
    [selected],
  );
  const inferredOriginYardId = useMemo(() => {
    if (yardSet.size === 1) return selected[0]?.slot?.yard?.id;
    return yardId;
  }, [selected, yardSet, yardId]);

  // 从选中 VIN 里推导 customerId：拉该客户的地址簿，匹配 dealer_code → 展示门店信息
  const selectedCustomerId = useMemo(
    () => selected[0]?.order?.customerId,
    [selected],
  );
  useEffect(() => {
    setManualDealerId(undefined);
    if (!selectedCustomerId) {
      setCustomerAddresses([]);
      return;
    }
    customersApi
      .get(selectedCustomerId)
      .then((c) => setCustomerAddresses(c.addresses ?? []))
      .catch(() => setCustomerAddresses([]));
  }, [selectedCustomerId]);

  // 匹配的门店：手动选优先，其次按 dealer_code 自动匹配
  const autoMatchedDealer = useMemo(() => {
    const dc = selected[0]?.dealerCode;
    if (!dc) return null;
    return customerAddresses.find((a) => a.code === dc) ?? null;
  }, [selected, customerAddresses]);
  const matchedDealer = useMemo(() => {
    if (manualDealerId) {
      return customerAddresses.find((a) => a.id === manualDealerId) ?? null;
    }
    return autoMatchedDealer;
  }, [manualDealerId, autoMatchedDealer, customerAddresses]);

  const dealerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of available) {
      if (v.dealerCode) {
        map.set(v.dealerCode, v.dealerName ?? v.dealerCode);
      }
    }
    return Array.from(map.entries()).map(([code, name]) => ({
      value: code,
      label: `${name} (${code})`,
    }));
  }, [available]);

  const groupOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of available) if (v.groupCode) s.add(v.groupCode);
    return Array.from(s).map((g) => ({ value: g, label: g }));
  }, [available]);

  const validationError = useMemo(() => {
    if (selected.length === 0) return null;
    if (dealerSet.size > 1) return t('outbound.plan.errMultiDealer');
    if (yardSet.size > 1) return t('outbound.plan.errMultiYard');
    if (!carrierId) return t('outbound.plan.errNoCarrier');
    if (!inferredOriginYardId) return t('outbound.plan.errNoYard');
    return null;
  }, [
    selected.length,
    dealerSet.size,
    yardSet.size,
    carrierId,
    inferredOriginYardId,
    t,
  ]);

  const submit = async () => {
    if (validationError || selected.length === 0 || !carrierId) return;
    setSubmitting(true);
    try {
      const res = await outboundApi.plan({
        orderVinIds: selected.map((v) => v.id),
        originYardId: inferredOriginYardId!,
        carrierId,
        towType,
        customerWaybillCode: customerWaybillCode || undefined,
        destinationDealerId: manualDealerId || undefined,
        recipientName: recipientName || undefined,
        recipientPhone: recipientPhone || undefined,
        remark: remark || undefined,
      });
      message.success(
        t('outbound.plan.success', {
          waybillCode: res.waybillCode,
          n: selected.length,
        }),
      );
      // 重置右侧 + 刷新可用池
      setSelectedIds([]);
      setCustomerWaybillCode('');
      setRecipientName('');
      setRecipientPhone('');
      setManualDealerId(undefined);
      setRemark('');
      reload();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
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
        subtitle={t('outbound.plan.subtitle')}
      />

      <Row gutter={16}>
        <Col span={16}>
          <Card
            title={t('outbound.plan.availablePool')}
            extra={
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {t('outbound.plan.availableCount', { n: available.length })}
              </span>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Select
                placeholder={t('outbound.plan.filterOutboundOrder')}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 340 }}
                value={outboundOrderId}
                onChange={(v) => {
                  setOutboundOrderId(v);
                  // 换/清出库单时把选中 VIN 清空，避免脏数据
                  setSelectedIds([]);
                  // 清出库单时把其他 filter 也重置（否则用户会莫名其妙看不到自己客户的车）
                  if (!v) {
                    setCustomerId(undefined);
                    setYardId(undefined);
                    setDealerCode(undefined);
                    setGroupCode(undefined);
                  }
                }}
                options={outboundOrders.map((o) => ({
                  value: o.id,
                  label: `${o.orderCode}${o.customerOrderNo ? ' · ' + o.customerOrderNo : ''} · ${o.customerName}`,
                }))}
              />
              <Select
                placeholder={t('outbound.plan.filterCustomer')}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 200 }}
                value={customerId}
                onChange={setCustomerId}
                disabled={!!outboundOrderId}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                placeholder={t('outbound.plan.filterYard')}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 200 }}
                value={yardId}
                onChange={setYardId}
                disabled={!!outboundOrderId}
                options={yards.map((y) => ({
                  value: y.id,
                  label: `${y.name} (${y.code})`,
                }))}
              />
              <Select
                placeholder={t('outbound.plan.filterDealer')}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 220 }}
                value={dealerCode}
                onChange={setDealerCode}
                disabled={!!outboundOrderId}
                options={dealerOptions}
              />
              <Select
                placeholder={t('outbound.plan.filterGroup')}
                allowClear
                style={{ width: 140 }}
                value={groupCode}
                onChange={setGroupCode}
                disabled={!!outboundOrderId}
                options={groupOptions}
              />
            </Space>
            {outboundOrderId && (
              <Alert
                type="info"
                showIcon
                message={t('outbound.plan.lockedByOrderHint')}
                style={{ marginBottom: 12 }}
              />
            )}

            <Table
              rowKey="id"
              size="small"
              loading={loading}
              dataSource={available}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: setSelectedIds,
              }}
              pagination={{ pageSize: 20 }}
              columns={[
                { title: 'VIN', dataIndex: 'vin', width: 190 },
                {
                  title: t('outbound.plan.dealer'),
                  render: (_, r) => r.dealerName ?? r.dealerCode ?? '-',
                },
                {
                  title: t('outbound.plan.tow'),
                  dataIndex: 'towType',
                  render: (v: string | null) =>
                    v ? <Tag color="blue">{v}</Tag> : '-',
                },
                {
                  title: t('outbound.plan.group'),
                  dataIndex: 'groupCode',
                  render: (v: string | null) =>
                    v ? <Tag color="purple">{v}</Tag> : '-',
                },
                {
                  title: t('outbound.plan.slot'),
                  render: (_, r) =>
                    r.slot ? (
                      <Tag color="green">
                        {r.slot.yard?.code}·{r.slot.code}
                      </Tag>
                    ) : (
                      '-'
                    ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card title={t('outbound.plan.summary')}>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              <div>
                {t('outbound.plan.selectedCount')}:{' '}
                <strong>{selected.length}</strong>
              </div>
              {dealerSet.size > 0 && (
                <div style={{ marginTop: 4 }}>
                  {t('outbound.plan.summaryDealer')}:{' '}
                  {Array.from(dealerSet).map((d) => (
                    <Tag key={d}>{d}</Tag>
                  ))}
                </div>
              )}
              {yardSet.size > 0 && (
                <div style={{ marginTop: 4 }}>
                  {t('outbound.plan.summaryYard')}:{' '}
                  {Array.from(yardSet).map((yid) => {
                    const y = yards.find((yy) => yy.id === yid);
                    return (
                      <Tag key={yid}>{y ? `${y.name} (${y.code})` : yid}</Tag>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 匹配到的门店信息：从客户地址簿按 dealer_code 反查，帮业务员核对 */}
            {selected.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {t('outbound.plan.destinationDealer')}
                  </div>
                  {/* 手动选门店：默认走 auto，用户可覆盖 */}
                  {customerAddresses.length > 0 && (
                    <Select
                      style={{ width: '100%', marginBottom: 8 }}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={
                        autoMatchedDealer
                          ? t('outbound.plan.dealerAutoSelected', {
                              name: autoMatchedDealer.dealerName,
                            })
                          : t('outbound.plan.dealerSelectPlaceholder')
                      }
                      value={manualDealerId}
                      onChange={setManualDealerId}
                      options={customerAddresses.map((a) => ({
                        value: a.id,
                        label: `${a.dealerName}${a.code ? ' (' + a.code + ')' : ''}${a.region ? ' · ' + a.region : ''}`,
                      }))}
                    />
                  )}
                  {matchedDealer ? (
                    <div
                      style={{
                        background: '#f0fdf4',
                        padding: 10,
                        borderRadius: 4,
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>
                        {matchedDealer.dealerName}
                      </div>
                      <div style={{ color: '#64748b', marginTop: 2 }}>
                        {matchedDealer.address}
                      </div>
                      {matchedDealer.region && (
                        <Tag color="blue" style={{ marginTop: 4 }}>
                          {matchedDealer.region}
                        </Tag>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: '#fef2f2',
                        padding: 10,
                        borderRadius: 4,
                        border: '1px solid #fecaca',
                        color: '#991b1b',
                      }}
                    >
                      {t('outbound.plan.dealerNotFound', {
                        code: selected[0]?.dealerCode ?? '',
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            <Divider style={{ margin: '12px 0' }} />

            <Form layout="vertical">
              <Form.Item label={t('outbound.plan.carrier')} required>
                <Select
                  placeholder={t('outbound.plan.carrierPlaceholder')}
                  showSearch
                  optionFilterProp="label"
                  value={carrierId}
                  onChange={setCarrierId}
                  options={carriers.map((c) => ({
                    value: c.id,
                    label: `${c.name}${c.type === 'SELF_OWNED' ? ' (自营)' : ''}`,
                  }))}
                />
              </Form.Item>
              <Form.Item label={t('outbound.plan.towType')}>
                <Select
                  placeholder={t('outbound.plan.towTypePlaceholder')}
                  allowClear
                  value={towType}
                  onChange={setTowType}
                  options={[
                    { value: 'CC', label: 'CC' },
                    { value: 'TOWING', label: 'TOWING' },
                    { value: 'TANSYA', label: 'TANSYA' },
                  ]}
                />
              </Form.Item>
              <Form.Item label={t('outbound.plan.customerWaybillCode')}>
                <Input
                  value={customerWaybillCode}
                  onChange={(e) => setCustomerWaybillCode(e.target.value)}
                  placeholder="e.g. BYD-WB-2026-07-001"
                />
              </Form.Item>
              <Form.Item
                label={t('outbound.plan.recipientName')}
                extra={
                  matchedDealer?.contactName
                    ? t('outbound.plan.recipientDefaultHint', {
                        name: matchedDealer.contactName,
                      })
                    : undefined
                }
              >
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder={
                    matchedDealer?.contactName ??
                    t('outbound.plan.recipientPlaceholder')
                  }
                />
              </Form.Item>
              <Form.Item
                label={t('outbound.plan.recipientPhone')}
                extra={
                  matchedDealer?.contactPhone
                    ? t('outbound.plan.recipientDefaultHint', {
                        name: matchedDealer.contactPhone,
                      })
                    : undefined
                }
              >
                <Input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder={
                    matchedDealer?.contactPhone ??
                    t('outbound.plan.recipientPhonePlaceholder')
                  }
                />
              </Form.Item>
              <Form.Item label={t('outbound.plan.remark')}>
                <Input.TextArea
                  rows={2}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                />
              </Form.Item>
            </Form>

            {validationError && (
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
              disabled={
                selected.length === 0 ||
                !!validationError ||
                !carrierId ||
                !inferredOriginYardId
              }
              onClick={submit}
            >
              {t('outbound.plan.submit', { n: selected.length })}
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// useSearchParams 需要 Suspense 边界
export default function OutboundPlanPage() {
  return (
    <Suspense>
      <OutboundPlanInner />
    </Suspense>
  );
}
