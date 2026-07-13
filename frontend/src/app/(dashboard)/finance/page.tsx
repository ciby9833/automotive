'use client';

import { useEffect, useState } from 'react';
import { Button, Select, Space, Table, Tag, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { financeApi, FinanceRecord } from '@/lib/api/finance';
import { customersApi, Customer } from '@/lib/api/customers';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { formatCurrency } from '@/lib/currency/format';
import { Role } from '@/lib/auth/role';
import { OrgFilter } from '@/components/layout/OrgFilter';

// 对账收入按客户维度、成本按供应商维度
// 客户账号在此菜单只应看到自己的账单并"确认"；发送账单/客户选择器是内部会计动作
export default function FinancePage() {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>();
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const role = useAuthStore((s) => s.user?.role);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  // 只有内部管理员能向客户发送账单
  const canSendBill = role === Role.HQ_ADMIN || role === Role.ORG_ADMIN;

  // finance 记录里带 waybill.organization，用它来渲染所属机构（客户账号 useOrganizations() 为空也能显示）
  const financeRecordOrgProxy = (r: FinanceRecord) => ({
    organization: r.waybill?.organization,
  });

  const load = () => {
    setLoading(true);
    financeApi
      .list({ organizationId: orgFilter })
      .then(setRecords)
      .catch(() => message.error(t('finance.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canSendBill) {
      customersApi.list().then(setCustomers).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, canSendBill]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [activeOrgId, orgFilter]);

  const onSendBill = async () => {
    if (!selectedCustomerId) return;
    setSending(true);
    try {
      await financeApi.notifyCustomer(selectedCustomerId);
      message.success(t('finance.sendBillSuccess'));
    } catch (err) {
      const detail =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(detail || t('finance.sendBillFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('finance.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        {canSendBill && (
          <Space>
            <Select
              style={{ width: 220 }}
              placeholder={t('finance.selectCustomer')}
              value={selectedCustomerId}
              onChange={setSelectedCustomerId}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              allowClear
            />
            <Button
              icon={<SendOutlined />}
              disabled={!selectedCustomerId}
              loading={sending}
              onClick={onSendBill}
            >
              {t('finance.sendBill')}
            </Button>
          </Space>
        )}
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={records}
        columns={[
          {
            title: t('finance.organization'),
            render: (_: unknown, record: FinanceRecord) =>
              orgNameFromRecord(
                financeRecordOrgProxy(record),
                record.organizationId,
                organizations,
                locale,
              ),
          },
          {
            title: t('finance.type'),
            dataIndex: 'type',
            render: (v: string) => <Tag>{t(`financeType.${v}`)}</Tag>,
          },
          {
            title: t('finance.amount'),
            dataIndex: 'amount',
            render: (v: string, record: FinanceRecord) =>
              formatCurrency(v, record.currency, locale),
          },
          {
            title: t('finance.status'),
            dataIndex: 'status',
            render: (v: string) => (
              <Tag color={v === 'CONFIRMED' ? 'green' : 'gold'}>{t(`financeStatus.${v}`)}</Tag>
            ),
          },
          { title: t('finance.invoiceRef'), dataIndex: 'invoiceRef' },
          {
            title: t('finance.action'),
            render: (_: unknown, record: FinanceRecord) =>
              record.status === 'PENDING' ? (
                <Button
                  size="small"
                  onClick={async () => {
                    await financeApi.confirm(record.id);
                    load();
                  }}
                >
                  {t('finance.confirm')}
                </Button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
