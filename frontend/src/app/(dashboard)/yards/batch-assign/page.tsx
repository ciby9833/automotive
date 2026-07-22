'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  DownloadOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { yardsApi, Yard } from '@/lib/api/yards';
import {
  BatchAssignRow,
  downloadBatchAssignTemplate,
  parseBatchAssignExcel,
} from '@/lib/yards/batch-assign-excel';
import { useTranslation } from '@/i18n/useTranslation';
import { useAuthStore } from '@/lib/auth/store';

// 场内库位批量分配
// 用场景：go-live 时物理车辆已在场地要一次性入库；日常也可当"批量移位"
// 流程：选场地 → 下载模板 → 上传 Excel → 预览 → 提交 → 查看每行结果
export default function YardBatchAssignPage() {
  const { t } = useTranslation();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [yards, setYards] = useState<Yard[]>([]);
  const [yardId, setYardId] = useState<string | undefined>();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<BatchAssignRow[]>([]);
  const [parseInfo, setParseInfo] = useState<{
    total: number;
    unmapped: string[];
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    succeeded: number;
    skipped: Array<{ vin: string; reason: string }>;
    failed: Array<{ vin: string; slotCode: string; reason: string }>;
  } | null>(null);

  useEffect(() => {
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
      setResult(null);
      try {
        const parsed = await parseBatchAssignExcel(f);
        if (parsed.rows.length === 0) {
          setParseError(t('yards.batchAssign.noRows'));
          return false;
        }
        setRows(parsed.rows);
        setParseInfo({
          total: parsed.totalReadRows,
          unmapped: parsed.unmappedHeaders,
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
      setResult(null);
    },
    fileList: file
      ? [{ uid: '1', name: file.name, status: 'done' as const, size: file.size }]
      : [],
  };

  const submit = async () => {
    if (!yardId) {
      message.warning(t('yards.batchAssign.pickYardFirst'));
      return;
    }
    if (rows.length === 0) {
      message.warning(t('yards.batchAssign.uploadFirst'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await yardsApi.batchAssignSlots({
        yardId,
        items: rows,
        remark: remark || undefined,
      });
      setResult(res);
      if (res.failed.length === 0 && res.skipped.length === 0) {
        message.success(t('yards.batchAssign.allOk', { n: res.succeeded }));
      } else {
        message.warning(
          t('yards.batchAssign.partial', {
            ok: res.succeeded,
            fail: res.failed.length,
            skip: res.skipped.length,
          }),
        );
      }
      // 有提交就清空 upload / 预览 / 备注，避免再点一次重复导入
      // 结果表继续展示到用户手动关掉 / 上传新文件
      setFile(null);
      setRows([]);
      setParseInfo(null);
      setParseError(null);
      setRemark('');
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('yards.batchAssign.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('yards.batchAssign.title')}</h2>

      <Alert
        type="info"
        showIcon
        message={t('yards.batchAssign.hintTitle')}
        description={
          <div style={{ fontSize: 13 }}>
            <div>{t('yards.batchAssign.hintTemplate')}</div>
            <div style={{ marginTop: 4 }}>
              <Tag>VIN</Tag>
              <Tag>SlotCode</Tag>
            </div>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={downloadBatchAssignTemplate}
              style={{ paddingLeft: 0, marginTop: 4 }}
            >
              {t('yards.batchAssign.downloadTemplate')}
            </Button>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <Card
        size="small"
        title={t('yards.batchAssign.step1')}
        style={{ marginBottom: 12 }}
      >
        <Select
          style={{ width: '100%', maxWidth: 480 }}
          value={yardId}
          onChange={setYardId}
          placeholder={t('yards.batchAssign.yardPlaceholder')}
          showSearch
          optionFilterProp="label"
          options={yards.map((y) => ({
            value: y.id,
            label: `${y.name} (${y.code})`,
          }))}
        />
      </Card>

      <Card
        size="small"
        title={t('yards.batchAssign.step2')}
        style={{ marginBottom: 12 }}
      >
        <Upload.Dragger {...uploadProps} style={{ padding: '16px 24px' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t('yards.batchAssign.dragHere')}</p>
          <p className="ant-upload-hint" style={{ color: '#94a3b8' }}>
            {t('yards.batchAssign.dragHint')}
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
            message={t('yards.batchAssign.parsedSuccess', {
              n: rows.length,
              total: parseInfo.total,
            })}
            description={
              parseInfo.unmapped.length > 0 ? (
                <span style={{ fontSize: 12 }}>
                  {t('yards.batchAssign.ignoredColumns')}:{' '}
                  {parseInfo.unmapped.map((h) => (
                    <Tag key={h}>{h}</Tag>
                  ))}
                </span>
              ) : undefined
            }
          />
        )}
        {rows.length > 0 && (
          <Table
            size="small"
            rowKey={(r) => r.vin + r.slotCode}
            dataSource={rows.slice(0, 20)}
            pagination={false}
            style={{ marginTop: 12 }}
            columns={[
              { title: 'VIN', dataIndex: 'vin' },
              { title: 'SlotCode', dataIndex: 'slotCode' },
            ]}
            footer={() =>
              rows.length > 20 ? (
                <div style={{ color: '#94a3b8' }}>
                  {t('yards.batchAssign.previewMore', { n: rows.length - 20 })}
                </div>
              ) : null
            }
          />
        )}
      </Card>

      <Card size="small" title={t('yards.batchAssign.step3')}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            rows={2}
            placeholder={t('yards.batchAssign.remarkPlaceholder')}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={submitting}
            disabled={rows.length === 0 || !yardId}
            onClick={submit}
          >
            {t('yards.batchAssign.submit', { n: rows.length })}
          </Button>
        </Space>
      </Card>

      {result && (
        <Card size="small" style={{ marginTop: 12 }}>
          <Descriptions
            title={t('yards.batchAssign.resultTitle')}
            column={4}
            size="small"
          >
            <Descriptions.Item label={t('yards.batchAssign.total')}>
              <Tag>{result.total}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('yards.batchAssign.succeeded')}>
              <Tag color="green">{result.succeeded}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('yards.batchAssign.skippedLabel')}>
              <Tag color="gold">{result.skipped.length}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('yards.batchAssign.failedLabel')}>
              <Tag color="red">{result.failed.length}</Tag>
            </Descriptions.Item>
          </Descriptions>

          {result.skipped.length > 0 && (
            <>
              <Divider />
              <h4 style={{ margin: '8px 0' }}>
                {t('yards.batchAssign.skippedTitle')}
              </h4>
              <Table
                size="small"
                rowKey={(r) => r.vin + r.reason}
                dataSource={result.skipped}
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: 'VIN', dataIndex: 'vin' },
                  {
                    title: t('yards.batchAssign.reason'),
                    dataIndex: 'reason',
                  },
                ]}
              />
            </>
          )}
          {result.failed.length > 0 && (
            <>
              <Divider />
              <h4 style={{ margin: '8px 0' }}>
                {t('yards.batchAssign.failedTitle')}
              </h4>
              <Table
                size="small"
                rowKey={(r) => r.vin + r.slotCode}
                dataSource={result.failed}
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: 'VIN', dataIndex: 'vin' },
                  { title: 'SlotCode', dataIndex: 'slotCode' },
                  {
                    title: t('yards.batchAssign.reason'),
                    dataIndex: 'reason',
                  },
                ]}
              />
            </>
          )}
          {result.skipped.length === 0 && result.failed.length === 0 && (
            <Empty description={t('yards.batchAssign.allOkShort')} />
          )}
        </Card>
      )}
    </div>
  );
}
