'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { customersApi, Customer } from '@/lib/api/customers';
import { yardsApi, Yard } from '@/lib/api/yards';
import { outboundApi, OutboundVinRow } from '@/lib/api/outbound';
import { parseOutboundExcel } from '@/lib/outbound/parse-excel';
import { downloadOutboundTemplate } from '@/lib/outbound/generate-template';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';

// 出库订单导入向导
// 1. 上传客户 (BYD) 提供的发货 Excel → 解析 dealer/towType/group
// 2. 填订单头 (客户/始发仓/客户单号/备注)
// 3. 提交 → 后端匹配已入库 VIN，写入 dealer 属性
export default function OutboundImportPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<OutboundVinRow[]>([]);
  const [parseInfo, setParseInfo] = useState<{
    total: number;
    mapped: string[];
    unmapped: string[];
    invalidTowTypeCount: number;
  } | null>(null);

  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => undefined);
    yardsApi.list().then(setYards).catch(() => undefined);
  }, [activeOrgId]);

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls,.csv',
    maxCount: 1,
    beforeUpload: async (f) => {
      setFile(f);
      setParseError(null);
      setRows([]);
      setParseInfo(null);
      try {
        const result = await parseOutboundExcel(f);
        if (result.rows.length === 0) {
          setParseError(t('outbound.import.noRows'));
          message.error(t('outbound.import.noRows'));
          return false;
        }
        setRows(result.rows);
        setParseInfo({
          total: result.totalReadRows,
          mapped: Object.entries(result.mappedColumns).map(
            ([field, header]) => `${field} ← ${header}`,
          ),
          unmapped: result.unmappedHeaders,
          invalidTowTypeCount: result.invalidTowTypeCount,
        });
        // Toast 让用户明确知道解析成功了，Alert 只是补充说明列映射
        message.success(
          t('outbound.import.parsedSuccess', {
            n: result.rows.length,
            total: result.totalReadRows,
          }),
        );
      } catch (err) {
        const msg = (err as Error).message;
        setParseError(msg);
        message.error(msg);
      }
      return false;
    },
    onRemove: () => {
      setFile(null);
      setRows([]);
      setParseInfo(null);
      setParseError(null);
    },
    fileList: file
      ? [{ uid: '1', name: file.name, status: 'done' as const, size: file.size }]
      : [],
  };

  const onSubmit = async (values: {
    customerId: string;
    originYardId: string;
    customerOrderNo?: string;
    remark?: string;
  }) => {
    if (rows.length === 0) {
      message.warning(t('outbound.import.uploadFirst'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await outboundApi.importOrder({
        customerId: values.customerId,
        originYardId: values.originYardId,
        customerOrderNo: values.customerOrderNo,
        remark: values.remark,
        vins: rows,
      });
      if (res.missing.length > 0) {
        message.warning(
          t('outbound.import.successWithMissing', {
            matched: res.matched,
            missing: res.missing.length,
          }),
        );
      } else {
        message.success(
          t('outbound.import.success', {
            orderCode: res.orderCode,
            matched: res.matched,
          }),
        );
      }
      router.push(`/outbound/orders/${res.orderId}`);
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.import.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('outbound.import.title')} />

      <Alert
        type="info"
        showIcon
        message={t('outbound.import.hintTitle')}
        description={
          <div>
            <div>{t('outbound.import.hintTemplate')}</div>
            <div style={{ marginTop: 4 }}>
              <Tag>VIN</Tag>
              <Tag>Brand</Tag>
              <Tag>Model</Tag>
              <Tag>Color</Tag>
              <Tag>DealerCode</Tag>
              <Tag>DealerName</Tag>
              <Tag>TowType</Tag>
              <Tag>GroupCode</Tag>
            </div>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={downloadOutboundTemplate}
              style={{ paddingLeft: 0, marginTop: 4 }}
            >
              {t('outbound.import.downloadTemplate')}
            </Button>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <Card title={t('outbound.import.step1')} style={{ marginBottom: 16 }}>
        <Upload.Dragger {...uploadProps} style={{ padding: '16px 24px' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t('outbound.import.dragHere')}</p>
          <p className="ant-upload-hint" style={{ color: '#94a3b8' }}>
            {t('outbound.import.dragHint')}
          </p>
        </Upload.Dragger>
        {parseError && (
          <Alert
            type="error"
            message={parseError}
            style={{ marginTop: 12 }}
            closable
            onClose={() => setParseError(null)}
          />
        )}
        {parseInfo && (
          <Alert
            type={parseInfo.invalidTowTypeCount > 0 ? 'warning' : 'success'}
            style={{ marginTop: 12 }}
            message={t('outbound.import.parsedSuccess', {
              n: rows.length,
              total: parseInfo.total,
            })}
            description={
              <div style={{ fontSize: 12, color: '#64748b' }}>
                <div>
                  {t('outbound.import.mappedColumns')}:{' '}
                  {parseInfo.mapped.map((m) => (
                    <Tag key={m}>{m}</Tag>
                  ))}
                </div>
                {parseInfo.unmapped.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {t('outbound.import.ignoredColumns')}:{' '}
                    {parseInfo.unmapped.map((h) => (
                      <Tag key={h} color="default">
                        {h}
                      </Tag>
                    ))}
                  </div>
                )}
                {parseInfo.invalidTowTypeCount > 0 && (
                  <div style={{ marginTop: 4, color: '#d97706' }}>
                    {t('outbound.import.invalidTowType', {
                      n: parseInfo.invalidTowTypeCount,
                    })}
                  </div>
                )}
              </div>
            }
          />
        )}
        {rows.length > 0 && (
          <Table
            size="small"
            rowKey="vin"
            dataSource={rows.slice(0, 20)}
            pagination={false}
            style={{ marginTop: 16 }}
            columns={[
              { title: 'VIN', dataIndex: 'vin' },
              { title: 'Model', dataIndex: 'model' },
              { title: 'Color', dataIndex: 'color' },
              { title: 'DealerCode', dataIndex: 'dealerCode' },
              { title: 'DealerName', dataIndex: 'dealerName' },
              {
                title: 'TowType',
                dataIndex: 'towType',
                render: (v: string | undefined) =>
                  v ? <Tag color="blue">{v}</Tag> : '-',
              },
              { title: 'Group', dataIndex: 'groupCode' },
            ]}
            footer={() =>
              rows.length > 20 ? (
                <div style={{ color: '#94a3b8' }}>
                  {t('outbound.import.previewMore', { n: rows.length - 20 })}
                </div>
              ) : null
            }
          />
        )}
      </Card>

      <Card title={t('outbound.import.step2')}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          disabled={rows.length === 0}
        >
          <Form.Item
            label={t('outbound.import.customer')}
            name="customerId"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              placeholder={t('outbound.import.customerPlaceholder')}
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item
            label={t('outbound.import.originYard')}
            name="originYardId"
            rules={[{ required: true }]}
            extra={t('outbound.import.originYardHint')}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={yards.map((y) => ({
                value: y.id,
                label: `${orgNameFromRecord(y, y.organizationId, organizations, locale)} · ${y.name} (${y.code})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            label={t('outbound.import.customerOrderNo')}
            name="customerOrderNo"
          >
            <Input placeholder="e.g. BYD-DEL-2026-07-001" />
          </Form.Item>
          <Form.Item label={t('outbound.import.remark')} name="remark">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={rows.length === 0}
            >
              {t('outbound.import.submit', { n: rows.length })}
            </Button>
            <Button onClick={() => router.push('/outbound/orders')}>
              {t('common.cancel')}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
