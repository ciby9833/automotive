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
  Progress,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { yardsApi, Yard, YardSlot, YardZoneSummary } from '@/lib/api/yards';
import { formatSlotCode } from '@/lib/slots';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { Permission, usePermission } from '@/lib/auth/permissions';
import { Role } from '@/lib/auth/role';

// 库位配置 (Setup) - Zone-first：先建区（AB6, D1, ...），再按区生成 line×row 库位
// 页面结构：
//   顶部：Yard 选择 + 状态卡
//   左：Zones 列表（新建/编辑/生成/删除）
//   右：选中 Zone 内的 Slots 明细（只读，含占用情况）
export default function SlotSetupPage() {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<string | null>(null);
  const [zones, setZones] = useState<YardZoneSummary[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();

  const [zoneEditOpen, setZoneEditOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<YardZoneSummary | null>(null);
  const [zoneTargetYards, setZoneTargetYards] = useState<Yard[]>([]);
  const [zoneTargetYardsLoading, setZoneTargetYardsLoading] = useState(false);
  const [zoneForm] = Form.useForm();
  const zoneTargetOrganizationId = Form.useWatch('organizationId', zoneForm);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateZone, setGenerateZone] = useState<YardZoneSummary | null>(null);
  const [generateForm] = Form.useForm();

  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const currentRole = useAuthStore((s) => s.user?.role);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  const canManageZone = usePermission(Permission.SETUP_ZONE_CRUD);
  const isHqAdmin = currentRole === Role.HQ_ADMIN;
  const selectedOrganizationId = isHqAdmin
    ? orgFilter
    : activeOrgId ?? undefined;

  const selectedYard = yards.find((y) => y.id === selectedYardId) ?? null;
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  const loadYards = async () => {
    if (!selectedOrganizationId) {
      setYards([]);
      setSelectedYardId(null);
      return;
    }
    try {
      const list = await yardsApi.list(selectedOrganizationId);
      setYards(list);
      if (!list.some((y) => y.id === selectedYardId)) {
        setSelectedYardId(null);
      }
    } catch {
      message.error(t('yards.loadFailed'));
    }
  };

  const loadZones = async () => {
    if (!selectedYardId) {
      setZones([]);
      setSelectedZoneId(null);
      return;
    }
    setLoading(true);
    try {
      const list = await yardsApi.listZones(selectedYardId);
      setZones(list);
      if (list.length > 0 && !list.some((z) => z.id === selectedZoneId)) {
        setSelectedZoneId(list[0].id);
      } else if (list.length === 0) {
        setSelectedZoneId(null);
      }
    } catch {
      message.error(t('setupZones.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadSlots = async () => {
    if (!selectedYardId || !selectedZoneId) {
      setSlots([]);
      return;
    }
    try {
      const list = await yardsApi.slots(selectedYardId);
      setSlots(list.filter((s) => s.zoneId === selectedZoneId));
    } catch {
      message.error(t('yards.slotsLoadFailed'));
    }
  };

  useEffect(() => {
    loadYards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, selectedOrganizationId]);

  useEffect(() => {
    loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYardId]);

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYardId, selectedZoneId]);

  const yardStats = useMemo(() => {
    const total = zones.reduce((sum, z) => sum + z.slotCount, 0);
    const occupied = zones.reduce((sum, z) => sum + z.occupiedCount, 0);
    return { total, occupied, vacant: total - occupied };
  }, [zones]);

  // ============ Zone 新建/编辑 ============
  const loadZoneTargetYards = async (organizationId?: string) => {
    if (!organizationId) {
      setZoneTargetYards([]);
      return;
    }
    setZoneTargetYards([]);
    setZoneTargetYardsLoading(true);
    try {
      setZoneTargetYards(await yardsApi.list(organizationId));
    } catch {
      setZoneTargetYards([]);
      message.error(t('yards.loadFailed'));
    } finally {
      setZoneTargetYardsLoading(false);
    }
  };

  const openZoneEdit = (zone: YardZoneSummary | null) => {
    setEditingZone(zone);
    zoneForm.resetFields();
    if (zone) {
      zoneForm.setFieldsValue({
        organizationId: selectedYard?.organizationId,
        yardId: selectedYard?.id,
        code: zone.code,
        name: zone.name,
        lineCount: zone.lineCount,
        rowCount: zone.rowCount,
        isActive: zone.isActive,
      });
    } else {
      const initialOrganizationId = isHqAdmin
        ? selectedYard?.organizationId ?? orgFilter
        : activeOrgId ?? undefined;
      zoneForm.setFieldsValue({
        organizationId: initialOrganizationId,
        yardId:
          selectedYard?.organizationId === initialOrganizationId
            ? selectedYard?.id
            : undefined,
        code: '',
        name: '',
        lineCount: 1,
        rowCount: 20,
        isActive: true,
      });
      void loadZoneTargetYards(initialOrganizationId);
    }
    setZoneEditOpen(true);
  };

  const submitZoneEdit = async () => {
    const values = await zoneForm.validateFields();
    try {
      if (editingZone) {
        if (!selectedYardId) return;
        // update 仅改 code/name/isActive（lineCount/rowCount 是"设计尺寸"，改了需重新 generate）
        await yardsApi.updateZone(selectedYardId, editingZone.id, {
          code: values.code,
          name: values.name || null,
          isActive: values.isActive,
          lineCount: values.lineCount,
          rowCount: values.rowCount,
        });
        message.success(t('setupZones.updated'));
      } else {
        const targetYardId = values.yardId as string;
        const saved = await yardsApi.createZone(targetYardId, {
          code: values.code,
          name: values.name || null,
          lineCount: values.lineCount,
          rowCount: values.rowCount,
          isActive: values.isActive,
        });
        message.success(t('setupZones.created'));
        if (isHqAdmin) setOrgFilter(values.organizationId);
        setYards(zoneTargetYards);
        setSelectedYardId(targetYardId);
        setSelectedZoneId(saved.id);
      }
      setZoneEditOpen(false);
      if (editingZone) loadZones();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(detail || t('setupZones.saveFailed'));
    }
  };

  const removeZone = async (zone: YardZoneSummary) => {
    if (!selectedYardId) return;
    try {
      const res = await yardsApi.deleteZone(selectedYardId, zone.id);
      message.success(t('setupZones.removed', { n: res.deletedSlots }));
      if (selectedZoneId === zone.id) setSelectedZoneId(null);
      loadZones();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(detail || t('setupZones.removeFailed'));
    }
  };

  // ============ Generate slots ============
  const openGenerate = (zone: YardZoneSummary) => {
    setGenerateZone(zone);
    generateForm.resetFields();
    generateForm.setFieldsValue({
      fromLine: 1,
      toLine: zone.lineCount,
      toRow: zone.rowCount,
    });
    setGenerateOpen(true);
  };

  const submitGenerate = async () => {
    if (!selectedYardId || !generateZone) return;
    const values = await generateForm.validateFields();
    try {
      const res = await yardsApi.generateSlotsForZone(selectedYardId, generateZone.id, {
        fromLine: values.fromLine,
        toLine: values.toLine,
        toRow: values.toRow,
      });
      message.success(
        t('setupZones.generateResult', { created: res.created, skipped: res.skipped }),
      );
      setGenerateOpen(false);
      loadZones();
      loadSlots();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(detail || t('setupZones.generateFailed'));
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('setupSlots.title')}</h2>
          {isHqAdmin && (
            <Select
              style={{ width: 220 }}
              placeholder={t('setupSlots.selectOrganization')}
              value={orgFilter}
              onChange={(value) => {
                setOrgFilter(value);
                setSelectedYardId(null);
              }}
              options={organizations.map((organization) => ({
                value: organization.id,
                label: orgNameFromRecord(
                  undefined,
                  organization.id,
                  organizations,
                  locale,
                ),
              }))}
            />
          )}
          <Select
            style={{ width: 320 }}
            placeholder={t('setupSlots.selectYard')}
            disabled={!selectedOrganizationId}
            value={selectedYardId ?? undefined}
            onChange={(v) => setSelectedYardId(v)}
            options={yards.map((y) => ({
              value: y.id,
              label: `${y.name} (${y.code})`,
            }))}
          />
        </Space>
        {canManageZone && (
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openZoneEdit(null)}
            >
              {t('setupZones.newZone')}
            </Button>
          </Space>
        )}
      </div>

      {!selectedYardId ? (
        <Empty description={t('setupSlots.selectYardFirst')} />
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Space size="large" wrap>
              <Statistic
                title={t('setupZones.statZones')}
                value={zones.length}
              />
              <Statistic
                title={t('yards.statTotal')}
                value={yardStats.total}
                suffix={t('yards.statSlots')}
              />
              <Statistic
                title={t('yards.statOccupied')}
                value={yardStats.occupied}
                valueStyle={{ color: '#16a34a' }}
              />
              <Statistic
                title={t('yards.statVacant')}
                value={yardStats.vacant}
                valueStyle={{ color: '#eab308' }}
              />
            </Space>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={t('setupZones.hintTitle')}
              description={t('setupZones.hintDesc')}
            />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 16 }}>
            <Card
              title={t('setupZones.listTitle')}
              size="small"
              styles={{ body: { padding: 0 } }}
            >
              <Table<YardZoneSummary>
                size="small"
                rowKey="id"
                loading={loading}
                dataSource={zones}
                pagination={false}
                rowClassName={(record) =>
                  record.id === selectedZoneId ? 'ant-table-row-selected' : ''
                }
                onRow={(record) => ({
                  onClick: () => setSelectedZoneId(record.id),
                  style: { cursor: 'pointer' },
                })}
                columns={[
                  {
                    title: t('setupZones.colCode'),
                    dataIndex: 'code',
                    render: (v: string, r) => (
                      <Space>
                        <b>{v}</b>
                        {!r.isActive && <Tag>{t('setupZones.inactive')}</Tag>}
                      </Space>
                    ),
                  },
                  { title: t('setupZones.colName'), dataIndex: 'name' },
                  {
                    title: t('setupZones.colSize'),
                    render: (_: unknown, r) => `${r.lineCount} × ${r.rowCount}`,
                  },
                  {
                    title: t('setupZones.colFill'),
                    render: (_: unknown, r) => {
                      const cap = r.capacity;
                      const percent = cap === 0 ? 0 : Math.round((r.slotCount / cap) * 100);
                      return (
                        <div style={{ minWidth: 100 }}>
                          <Progress
                            percent={percent}
                            size="small"
                            format={() => `${r.slotCount}/${cap}`}
                          />
                        </div>
                      );
                    },
                  },
                  {
                    title: t('setupZones.colOccupied'),
                    render: (_: unknown, r) => `${r.occupiedCount}/${r.slotCount}`,
                  },
                  {
                    title: t('setupZones.colOps'),
                    render: (_: unknown, r) =>
                      canManageZone ? (
                        <Space size="small">
                          <Button
                            size="small"
                            icon={<ThunderboltOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              openGenerate(r);
                            }}
                          >
                            {t('setupZones.generate')}
                          </Button>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              openZoneEdit(r);
                            }}
                          />
                          <Popconfirm
                            title={t('setupZones.removeConfirm', { code: r.code })}
                            onConfirm={(e) => {
                              e?.stopPropagation();
                              removeZone(r);
                            }}
                            onCancel={(e) => e?.stopPropagation()}
                          >
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Popconfirm>
                        </Space>
                      ) : null,
                  },
                ]}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={t('setupZones.emptyForYard')}
                    />
                  ),
                }}
              />
            </Card>

            <Card
              title={selectedZone ? `${selectedZone.code} · ${t('setupZones.slotsTitle')}` : t('setupZones.slotsTitle')}
              size="small"
              extra={
                selectedZone && (
                  <span style={{ color: '#666' }}>
                    {selectedZone.slotCount}/{selectedZone.capacity}
                  </span>
                )
              }
            >
              {!selectedZone ? (
                <Empty description={t('setupZones.pickZone')} />
              ) : slots.length === 0 ? (
                <Empty description={t('setupZones.zoneEmpty')} />
              ) : (
                <Table<YardSlot>
                  size="small"
                  rowKey="id"
                  dataSource={slots}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: false,
                    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                  }}
                  columns={[
                    {
                      title: t('yards.slotCode'),
                      width: 140,
                      render: (_: unknown, slot) => formatSlotCode(slot),
                    },
                    { title: t('setupZones.colLine'), dataIndex: 'line', width: 80 },
                    { title: t('setupZones.colRow'), dataIndex: 'row', width: 80 },
                    {
                      title: t('yards.status'),
                      dataIndex: 'status',
                      width: 100,
                      render: (v: 'VACANT' | 'OCCUPIED', r) =>
                        r.isLocked ? (
                          <Tag color="red">{t('yards.slotLocked')}</Tag>
                        ) : v === 'OCCUPIED' ? (
                          <Tag color="green">{t('yards.slotOccupied')}</Tag>
                        ) : (
                          <Tag>{t('yards.slotVacant')}</Tag>
                        ),
                    },
                    {
                      title: 'VIN',
                      dataIndex: 'currentVin',
                      render: (v: string | null) => v ?? '-',
                    },
                  ]}
                />
              )}
            </Card>
          </div>
        </>
      )}

      <Modal
        title={editingZone ? t('setupZones.editTitle') : t('setupZones.createTitle')}
        open={zoneEditOpen}
        onCancel={() => setZoneEditOpen(false)}
        onOk={submitZoneEdit}
        destroyOnHidden
      >
        <Form form={zoneForm} layout="vertical">
          {editingZone ? (
            <>
              <Form.Item label={t('yards.organization')}>
                <Input
                  value={
                    selectedYard
                      ? orgNameFromRecord(
                          selectedYard,
                          selectedYard.organizationId,
                          organizations,
                          locale,
                        )
                      : '-'
                  }
                  disabled
                />
              </Form.Item>
              <Form.Item label={t('setupSlots.yard')}>
                <Input
                  value={
                    selectedYard
                      ? `${selectedYard.name} (${selectedYard.code})`
                      : '-'
                  }
                  disabled
                />
              </Form.Item>
            </>
          ) : (
            <>
              {isHqAdmin ? (
                <Form.Item
                  label={t('yards.organization')}
                  name="organizationId"
                  rules={[
                    {
                      required: true,
                      message: t('setupZones.organizationRequired'),
                    },
                  ]}
                >
                  <Select
                    placeholder={t('setupZones.selectOrganization')}
                    options={organizations.map((organization) => ({
                      value: organization.id,
                      label: orgNameFromRecord(
                        undefined,
                        organization.id,
                        organizations,
                        locale,
                      ),
                    }))}
                    onChange={(organizationId) => {
                      zoneForm.setFieldValue('yardId', undefined);
                      void loadZoneTargetYards(organizationId);
                    }}
                  />
                </Form.Item>
              ) : (
                <Form.Item label={t('yards.organization')}>
                  <Input
                    value={orgNameFromRecord(
                      undefined,
                      activeOrgId ?? undefined,
                      organizations,
                      locale,
                    )}
                    disabled
                  />
                </Form.Item>
              )}
              <Form.Item
                label={t('setupSlots.yard')}
                name="yardId"
                rules={[
                  { required: true, message: t('setupZones.yardRequired') },
                ]}
              >
                <Select
                  placeholder={t('setupZones.selectYard')}
                  loading={zoneTargetYardsLoading}
                  disabled={isHqAdmin && !zoneTargetOrganizationId}
                  options={zoneTargetYards.map((yard) => ({
                    value: yard.id,
                    label: `${yard.name} (${yard.code})`,
                  }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            label={t('setupZones.fieldCode')}
            name="code"
            rules={[
              { required: true, message: t('setupZones.codeRequired') },
              {
                pattern: /^[A-Za-z0-9_]{1,16}$/,
                message: t('setupZones.codePattern'),
              },
            ]}
            tooltip={t('setupZones.codeHint')}
          >
            <Input placeholder="AB6" />
          </Form.Item>
          <Form.Item label={t('setupZones.fieldName')} name="name">
            <Input placeholder={t('setupZones.namePlaceholder')} />
          </Form.Item>
          <>
              <Form.Item
                label={t('setupZones.fieldLineCount')}
                name="lineCount"
                rules={[{ required: true }]}
                tooltip={t('setupZones.lineCountHint')}
              >
                <InputNumber min={1} max={999} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item
                label={t('setupZones.fieldRowCount')}
                name="rowCount"
                rules={[{ required: true }]}
                tooltip={t('setupZones.rowCountHint')}
              >
                <InputNumber min={1} max={999} style={{ width: 120 }} />
              </Form.Item>
          </>
          <Form.Item
            label={t('setupZones.fieldActive')}
            name="isActive"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          generateZone
            ? t('setupZones.generateTitle', { code: generateZone.code })
            : t('setupZones.generate')
        }
        open={generateOpen}
        onCancel={() => setGenerateOpen(false)}
        onOk={submitGenerate}
        destroyOnHidden
      >
        {generateZone && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t('setupZones.generateHintTitle')}
              description={t('setupZones.generateHintDesc', {
                capacity: generateZone.capacity,
                exist: generateZone.slotCount,
              })}
            />
            <Form form={generateForm} layout="inline">
              <Form.Item label={t('setupZones.fromLine')} name="fromLine">
                <InputNumber min={1} max={generateZone.lineCount} />
              </Form.Item>
              <Form.Item label={t('setupZones.toLine')} name="toLine">
                <InputNumber min={1} max={generateZone.lineCount} />
              </Form.Item>
              <Form.Item label={t('setupZones.toRow')} name="toRow">
                <InputNumber min={1} max={generateZone.rowCount} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
