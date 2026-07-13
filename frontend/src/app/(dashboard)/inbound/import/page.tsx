'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  DatePicker,
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
import { customersApi, Customer } from '@/lib/api/customers';
import { yardsApi, Yard } from '@/lib/api/yards';
import { inboundApi, InboundVinRow } from '@/lib/api/inbound';
import { parseInboundExcel } from '@/lib/inbound/parse-excel';
import { downloadInboundTemplate } from '@/lib/inbound/generate-template';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';

// 入库订单导入向导：
// 1. 上传 .xlsx/.xls/.csv → 客户端解析 → 展示预览表
// 2. 填订单头 (客户/目的仓/起点/预计到货日/客户单号/备注)
// 3. 提交 → 后端一次事务创建订单 + N 条 VIN
export default function InboundImportPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<InboundVinRow[]>([]);
  const [parseInfo, setParseInfo] = useState<{
    total: number;
    mapped: string[];
    unmapped: string[];
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
        const result = await parseInboundExcel(f);
        if (result.rows.length === 0) {
          setParseError(t('inbound.import.noRows'));
          return false;
        }
        setRows(result.rows);
        setParseInfo({
          total: result.totalReadRows,
          mapped: Object.entries(result.mappedColumns).map(
            ([field, header]) => `${field} ← ${header}`,
          ),
          unmapped: result.unmappedHeaders,
        });
      } catch (err) {
        setParseError((err as Error).message);
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
      ? [
          {
            uid: '1',
            name: file.name,
            status: 'done' as const,
            size: file.size,
          },
        ]
      : [],
  };

  const onSubmit = async (values: {
    customerId: string;
    destinationYardId: string;
    customerOrderNo?: string;
    originText?: string;
    expectedArrivalDate?: { format: (fmt: string) => string };
    remark?: string;
  }) => {
    if (rows.length === 0) {
      message.warning(t('inbound.import.uploadFirst'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await inboundApi.importOrder({
        customerId: values.customerId,
        destinationYardId: values.destinationYardId,
        customerOrderNo: values.customerOrderNo,
        originText: values.originText,
        expectedArrivalDate: values.expectedArrivalDate?.format('YYYY-MM-DD'),
        remark: values.remark,
        vins: rows,
      });
      message.success(
        t('inbound.import.success', {
          orderCode: res.orderCode,
          created: res.created,
          skipped: res.skipped,
        }),
      );
      router.push(`/inbound/orders/${res.orderId}`);
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.import.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('inbound.import.title')}</h2>

      <Alert
        type="info"
        showIcon
        message={t('inbound.import.hintTitle')}
        description={
          <div>
            <div>{t('inbound.import.hintTemplate')}</div>
            <div style={{ marginTop: 4 }}>
              <Tag>VIN</Tag>
              <Tag>Brand</Tag>
              <Tag>Model</Tag>
              <Tag>Color</Tag>
              <Tag>VehicleType</Tag>
              <Tag>MotorNo</Tag>
            </div>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={downloadInboundTemplate}
              style={{ paddingLeft: 0, marginTop: 4 }}
            >
              {t('inbound.import.downloadTemplate')}
            </Button>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <Card title={t('inbound.import.step1')} style={{ marginBottom: 16 }}>
        <Upload.Dragger {...uploadProps} style={{ padding: '16px 24px' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t('inbound.import.dragHere')}</p>
          <p className="ant-upload-hint" style={{ color: '#94a3b8' }}>
            {t('inbound.import.dragHint')}
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
            type="success"
            style={{ marginTop: 12 }}
            message={t('inbound.import.parsedSuccess', {
              n: rows.length,
              total: parseInfo.total,
            })}
            description={
              <div style={{ fontSize: 12, color: '#64748b' }}>
                <div>
                  {t('inbound.import.mappedColumns')}:{' '}
                  {parseInfo.mapped.map((m) => (
                    <Tag key={m}>{m}</Tag>
                  ))}
                </div>
                {parseInfo.unmapped.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {t('inbound.import.ignoredColumns')}:{' '}
                    {parseInfo.unmapped.map((h) => (
                      <Tag key={h} color="default">
                        {h}
                      </Tag>
                    ))}
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
              { title: 'Brand', dataIndex: 'brand' },
              { title: 'Model', dataIndex: 'model' },
              { title: 'Color', dataIndex: 'color' },
              { title: 'VehicleType', dataIndex: 'vehicleType' },
              { title: 'MotorNo', dataIndex: 'motorNo' },
            ]}
            footer={() =>
              rows.length > 20 ? (
                <div style={{ color: '#94a3b8' }}>
                  {t('inbound.import.previewMore', { n: rows.length - 20 })}
                </div>
              ) : null
            }
          />
        )}
      </Card>

      <Card title={t('inbound.import.step2')}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          disabled={rows.length === 0}
        >
          <Form.Item
            label={t('inbound.import.customer')}
            name="customerId"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              placeholder={t('inbound.import.customerPlaceholder')}
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item
            label={t('inbound.import.destinationYard')}
            name="destinationYardId"
            rules={[{ required: true }]}
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
            label={t('inbound.import.customerOrderNo')}
            name="customerOrderNo"
            extra={t('inbound.import.customerOrderNoHint')}
          >
            <Input placeholder="e.g. BYD-2026-07-001" />
          </Form.Item>
          <Form.Item
            label={t('inbound.import.origin')}
            name="originText"
            extra={t('inbound.import.originHint')}
          >
            <Input placeholder="Jakarta Utara Port" />
          </Form.Item>
          <Form.Item
            label={t('inbound.import.expectedArrival')}
            name="expectedArrivalDate"
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('inbound.import.remark')} name="remark">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={rows.length === 0}
            >
              {t('inbound.import.submit', { n: rows.length })}
            </Button>
            <Button onClick={() => router.push('/inbound/orders')}>
              {t('common.cancel')}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
