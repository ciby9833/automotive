'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  AppstoreAddOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { yardsApi, Yard, YardSlot, SlotDto } from '@/lib/api/yards';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { Permission, useAnyPermission, usePermission } from '@/lib/auth/permissions';

// 库位配置(Setup) - 只做基础数据维护，日常运营在 /yards
// 支持: (a) Excel/CSV 导入 (b) 批量生成器 (c) 批量删除 (d) CSV 导出
export default function SlotSetupPage() {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<string | null>(null);
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [importPreview, setImportPreview] = useState<SlotDto[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genPreview, setGenPreview] = useState<SlotDto[]>([]);
  const [genForm] = Form.useForm();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  // 权限拆细：不是"能不能进这个页"，而是"能不能点这个按钮"
  const canImport = usePermission(Permission.SETUP_SLOT_IMPORT);
  const canDelete = usePermission(Permission.SETUP_SLOT_DELETE);
  const canCrud = usePermission(Permission.SETUP_SLOT_CRUD);
  const canManage = useAnyPermission(
    Permission.SETUP_SLOT_IMPORT,
    Permission.SETUP_SLOT_DELETE,
    Permission.SETUP_SLOT_CRUD,
  );

  const selectedYard = yards.find((y) => y.id === selectedYardId) ?? null;

  const loadYards = async () => {
    try {
      const list = await yardsApi.list(orgFilter);
      setYards(list);
      if (list.length > 0 && !list.some((y) => y.id === selectedYardId)) {
        setSelectedYardId(list[0].id);
      } else if (list.length === 0) {
        setSelectedYardId(null);
      }
    } catch {
      message.error(t('yards.loadFailed'));
    }
  };

  const loadSlots = async () => {
    if (!selectedYardId) {
      setSlots([]);
      return;
    }
    setLoading(true);
    try {
      setSlots(await yardsApi.slots(selectedYardId));
    } catch {
      message.error(t('yards.slotsLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadYards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter]);

  useEffect(() => {
    setSelectedIds([]);
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYardId]);

  const stats = useMemo(() => {
    const occupied = slots.filter((s) => s.status === 'OCCUPIED').length;
    return { total: slots.length, occupied, vacant: slots.length - occupied };
  }, [slots]);

  // ============ CSV 解析：客户上传的 Excel 导出成 CSV，或直接 CSV ============
  // 表头三列: code, row, slotNo（后两列可空）；忽略额外列
  const parseCsv = (text: string): SlotDto[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idxCode = header.indexOf('code');
    const idxRow = header.indexOf('row');
    const idxSlot = header.indexOf('slotno');
    if (idxCode < 0) throw new Error('CSV 缺少必填列 code');
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      return {
        code: cells[idxCode],
        row: idxRow >= 0 ? cells[idxRow] || undefined : undefined,
        slotNo: idxSlot >= 0 ? cells[idxSlot] || undefined : undefined,
      };
    }).filter((r) => r.code);
  };

  const uploadProps: UploadProps = {
    accept: '.csv,.txt',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseCsv(String(reader.result ?? ''));
          if (parsed.length === 0) {
            message.warning(t('slots.emptyImport'));
            return;
          }
          setImportPreview(parsed);
          setImportOpen(true);
        } catch (err) {
          message.error((err as Error).message || t('slots.parseError'));
        }
      };
      reader.readAsText(file);
      return false; // 阻止自动上传，我们只做前端解析
    },
  };

  const confirmImport = async () => {
    if (!selectedYardId || !importPreview) return;
    try {
      const res = await yardsApi.bulkCreateSlots(selectedYardId, importPreview);
      message.success(
        t('slots.importResult', { created: res.created, skipped: res.skipped }),
      );
      setImportOpen(false);
      setImportPreview(null);
      loadSlots();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } }).response
        ?.data?.message;
      message.error(detail || t('slots.importFailed'));
    }
  };

  // ============ 批量生成器：起始行/结束行 + 起始号/结束号 ============
  const rowsBetween = (startRow: string, endRow: string): string[] => {
    // 只支持单字符 A..Z 区间；多字符起点由 code 前缀自行处理
    const s = startRow.toUpperCase().charCodeAt(0);
    const e = endRow.toUpperCase().charCodeAt(0);
    if (isNaN(s) || isNaN(e) || s > e) return [];
    const out: string[] = [];
    for (let c = s; c <= e; c++) out.push(String.fromCharCode(c));
    return out;
  };

  const previewGenerator = () => {
    const values = genForm.getFieldsValue();
    const rows = rowsBetween(values.startRow || 'A', values.endRow || 'A');
    const startNo = Number(values.startNo ?? 1);
    const endNo = Number(values.endNo ?? 1);
    if (rows.length === 0 || startNo > endNo) {
      setGenPreview([]);
      return;
    }
    const pad = Math.max(String(endNo).length, 2); // 至少 2 位补零，A-01 而不是 A-1
    const list: SlotDto[] = [];
    for (const r of rows) {
      for (let n = startNo; n <= endNo; n++) {
        const numStr = String(n).padStart(pad, '0');
        list.push({
          code: `${r}-${numStr}`,
          row: r,
          slotNo: numStr,
        });
      }
    }
    setGenPreview(list);
  };

  const confirmGenerate = async () => {
    if (!selectedYardId || genPreview.length === 0) return;
    try {
      const res = await yardsApi.bulkCreateSlots(selectedYardId, genPreview);
      message.success(
        t('slots.importResult', { created: res.created, skipped: res.skipped }),
      );
      setGenerateOpen(false);
      setGenPreview([]);
      genForm.resetFields();
      loadSlots();
    } catch {
      message.error(t('slots.importFailed'));
    }
  };

  // ============ 批量删除 ============
  const confirmBulkDelete = async () => {
    if (!selectedYardId || selectedIds.length === 0) return;
    try {
      const res = await yardsApi.bulkDeleteSlots(
        selectedYardId,
        selectedIds as string[],
      );
      message.success(
        t('slots.deleteResult', { deleted: res.deleted, blocked: res.blocked }),
      );
      setSelectedIds([]);
      loadSlots();
    } catch {
      message.error(t('slots.deleteFailed'));
    }
  };

  // ============ CSV 导出 ============
  const exportCsv = () => {
    if (slots.length === 0) return;
    const header = 'code,row,slotNo,status,currentVin\n';
    const rows = slots
      .map(
        (s) =>
          `${s.code},${s.row ?? ''},${s.slotNo ?? ''},${s.status},${
            s.currentVin ?? ''
          }`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedYard?.code ?? 'slots'}-slots.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('setupSlots.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
          <Select
            style={{ width: 320 }}
            placeholder={t('setupSlots.selectYard')}
            value={selectedYardId ?? undefined}
            onChange={(v) => setSelectedYardId(v)}
            options={yards.map((y) => ({
              value: y.id,
              label: `${orgNameFromRecord(y, y.organizationId, organizations, locale)} · ${y.name} (${y.code})`,
            }))}
          />
        </Space>
        {canManage && selectedYardId && (
          <Space>
            {canImport && (
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />}>{t('setupSlots.importCsv')}</Button>
              </Upload>
            )}
            {canImport && (
              <Button
                icon={<AppstoreAddOutlined />}
                onClick={() => {
                  genForm.resetFields();
                  setGenPreview([]);
                  setGenerateOpen(true);
                }}
              >
                {t('setupSlots.generate')}
              </Button>
            )}
            {canCrud && (
              <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={slots.length === 0}>
                {t('setupSlots.exportCsv')}
              </Button>
            )}
            {canDelete && (
              <Popconfirm
                title={t('setupSlots.bulkDeleteConfirm', { n: selectedIds.length })}
                disabled={selectedIds.length === 0}
                onConfirm={confirmBulkDelete}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={selectedIds.length === 0}
                >
                  {t('setupSlots.bulkDelete', { n: selectedIds.length })}
                </Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </div>

      {selectedYardId ? (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Space size="large">
              <Statistic
                title={t('yards.statTotal')}
                value={stats.total}
                suffix={t('yards.statSlots')}
              />
              <Statistic
                title={t('yards.statOccupied')}
                value={stats.occupied}
                suffix={t('yards.statOccupiedSuffix')}
                valueStyle={{ color: '#16a34a' }}
              />
              <Statistic
                title={t('yards.statVacant')}
                value={stats.vacant}
                suffix={t('yards.statVacantSuffix')}
                valueStyle={{ color: '#eab308' }}
              />
            </Space>
          </Card>

          <Table
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={slots}
            rowSelection={
              canDelete
                ? { selectedRowKeys: selectedIds, onChange: setSelectedIds }
                : undefined
            }
            pagination={{ pageSize: 50 }}
            columns={[
              { title: t('yards.slotCode'), dataIndex: 'code' },
              { title: t('yards.slotRow'), dataIndex: 'row' },
              { title: t('yards.slotNo'), dataIndex: 'slotNo' },
              {
                title: t('yards.status'),
                dataIndex: 'status',
                render: (v: 'VACANT' | 'OCCUPIED') =>
                  v === 'OCCUPIED' ? (
                    <Tag color="green">{t('yards.slotOccupied')}</Tag>
                  ) : (
                    <Tag>{t('yards.slotVacant')}</Tag>
                  ),
              },
              { title: 'VIN', dataIndex: 'currentVin', render: (v: string | null) => v ?? '-' },
            ]}
          />
        </>
      ) : (
        <Empty description={t('setupSlots.selectYardFirst')} />
      )}

      {/* Excel/CSV 导入预览 */}
      <Modal
        title={t('setupSlots.importPreviewTitle')}
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={confirmImport}
        okText={t('setupSlots.confirmImport', { n: importPreview?.length ?? 0 })}
        width={720}
        destroyOnHidden
      >
        <Alert
          type="info"
          message={t('setupSlots.importPreviewHint')}
          style={{ marginBottom: 12 }}
        />
        <Table
          size="small"
          rowKey={(r) => r.code}
          dataSource={importPreview ?? []}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'code', dataIndex: 'code' },
            { title: 'row', dataIndex: 'row' },
            { title: 'slotNo', dataIndex: 'slotNo' },
          ]}
        />
      </Modal>

      {/* 批量生成器 */}
      <Modal
        title={t('setupSlots.generateTitle')}
        open={generateOpen}
        onCancel={() => setGenerateOpen(false)}
        onOk={confirmGenerate}
        okText={t('setupSlots.confirmGenerate', { n: genPreview.length })}
        width={720}
        destroyOnHidden
      >
        <Form
          form={genForm}
          layout="inline"
          initialValues={{ startRow: 'A', endRow: 'E', startNo: 1, endNo: 5 }}
          onValuesChange={previewGenerator}
        >
          <Form.Item label={t('setupSlots.startRow')} name="startRow" rules={[{ required: true }]}>
            <Input style={{ width: 60 }} maxLength={1} />
          </Form.Item>
          <Form.Item label={t('setupSlots.endRow')} name="endRow" rules={[{ required: true }]}>
            <Input style={{ width: 60 }} maxLength={1} />
          </Form.Item>
          <Form.Item label={t('setupSlots.startNo')} name="startNo" rules={[{ required: true }]}>
            <InputNumber min={1} max={9999} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item label={t('setupSlots.endNo')} name="endNo" rules={[{ required: true }]}>
            <InputNumber min={1} max={9999} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item>
            <Button onClick={previewGenerator}>{t('setupSlots.previewGenerate')}</Button>
          </Form.Item>
        </Form>
        <div style={{ marginTop: 12 }}>
          <Alert
            type="info"
            message={t('setupSlots.generatePreviewCount', { n: genPreview.length })}
          />
          <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 8 }}>
            <Space wrap>
              {genPreview.slice(0, 200).map((s) => (
                <Tag key={s.code}>{s.code}</Tag>
              ))}
              {genPreview.length > 200 && <Tag>...+{genPreview.length - 200}</Tag>}
            </Space>
          </div>
        </div>
      </Modal>
    </div>
  );
}
