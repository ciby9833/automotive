'use client';

import { useEffect, useMemo, useState } from 'react';
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
  OutboundOrderVinDetail,
  VehicleTowType,
} from '@/lib/api/outbound';
import { customersApi, Customer } from '@/lib/api/customers';
import { yardsApi, Yard } from '@/lib/api/yards';
import { carriersApi, Carrier } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

// 出库开单：从库存里选 VIN → 分配供应商 → 生成运单
// 业务规则：一张运单只能派往同一经销店 (后端校验，前端做同经销店过滤引导)
export default function OutboundPlanPage() {
  const { t } = useTranslation();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [available, setAvailable] = useState<OutboundOrderVinDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [yardId, setYardId] = useState<string | undefined>();
  const [dealerCode, setDealerCode] = useState<string | undefined>();
  const [groupCode, setGroupCode] = useState<string | undefined>();

  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [carrierId, setCarrierId] = useState<string | undefined>();
  const [towType, setTowType] = useState<VehicleTowType | undefined>();
  const [customerWaybillCode, setCustomerWaybillCode] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => undefined);
    yardsApi.list().then(setYards).catch(() => undefined);
    carriersApi.list().then(setCarriers).catch(() => undefined);
  }, []);

  const reload = () => {
    setLoading(true);
    outboundApi
      .listAvailable({ customerId, yardId, dealerCode, groupCode })
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
  }, [customerId, yardId, dealerCode, groupCode]);

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
                placeholder={t('outbound.plan.filterCustomer')}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 200 }}
                value={customerId}
                onChange={setCustomerId}
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
                options={dealerOptions}
              />
              <Select
                placeholder={t('outbound.plan.filterGroup')}
                allowClear
                style={{ width: 140 }}
                value={groupCode}
                onChange={setGroupCode}
                options={groupOptions}
              />
            </Space>

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
