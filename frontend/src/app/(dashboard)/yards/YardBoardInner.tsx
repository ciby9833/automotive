'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { CarOutlined, SwapOutlined } from '@ant-design/icons';
import { yardsApi, Yard, YardSlot, YardStats } from '@/lib/api/yards';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { Permission, usePermission } from '@/lib/auth/permissions';

// 场地看板(Operation) - 天天开的运营页面
// 只做：可视化 / VIN 搜索 / 移位 / 占用 / 释放。绝不出现"新增库位/删除库位"入口。
// 支持 URL 参数 ?yardId=X&highlightVin=Y 从 VIN 库存页跳转过来直接定位

function parseSlotCode(code: string): { row: string; col: string } | null {
  const m = code.match(/^([A-Za-z0-9]+)[-_ ]?([A-Za-z0-9]+)$/);
  return m ? { row: m[1].toUpperCase(), col: m[2] } : null;
}

function slotCellColor(status: YardSlot['status']): string {
  return status === 'OCCUPIED' ? '#16a34a' : '#0f172a';
}

export default function YardBoardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialYardId = searchParams.get('yardId');
  const initialHighlightVin = searchParams.get('highlightVin') ?? '';

  const [yards, setYards] = useState<Yard[]>([]);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [selectedYardId, setSelectedYardId] = useState<string | null>(initialYardId);
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [stats, setStats] = useState<YardStats | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [vinFilter, setVinFilter] = useState(initialHighlightVin);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // 场内移位：从 URL 里 select 一个源 slot，再点一个 vacant 目标一步完成
  const [moveMode, setMoveMode] = useState(false);
  const [moveFromSlotId, setMoveFromSlotId] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm] = Form.useForm();

  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  const canAssign = usePermission(Permission.YARD_ASSIGN_SLOT);
  const canRelease = usePermission(Permission.YARD_RELEASE_SLOT);
  const canMove = usePermission(Permission.YARD_MOVE_VEHICLE);

  // 车龄基线：只在 slots 刷新时冻结一次"当前时间"，避免每次 render 都 Date.now() 触发 React 19 纯性检查
  const nowRef = useMemo(() => Date.now(), [slots]);

  const selectedYard = yards.find((y) => y.id === selectedYardId) ?? null;
  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null;

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

  const loadSlots = async (yardId: string) => {
    setSlotsLoading(true);
    try {
      const [s, st] = await Promise.all([
        yardsApi.slots(yardId),
        yardsApi.stats(yardId),
      ]);
      setSlots(s);
      setStats(st);
    } catch {
      message.error(t('yards.slotsLoadFailed'));
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    loadYards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter]);

  useEffect(() => {
    if (!selectedYardId) {
      setSlots([]);
      setStats(null);
      return;
    }
    loadSlots(selectedYardId);
    setSelectedSlotId(null);
    setMoveMode(false);
    setMoveFromSlotId(null);
  }, [selectedYardId]);

  // 从 VIN 库存页跳转过来时，自动搜索 & 选中对应 slot
  useEffect(() => {
    if (!initialHighlightVin) return;
    const target = slots.find(
      (s) => (s.currentVin ?? '').toUpperCase() === initialHighlightVin.toUpperCase(),
    );
    if (target) setSelectedSlotId(target.id);
  }, [slots, initialHighlightVin]);

  const onAssignSlot = async (values: { vin: string }) => {
    if (!selectedSlotId) return;
    try {
      await yardsApi.assignSlot(selectedSlotId, values.vin);
      message.success(t('yards.slotAssignSuccess'));
      setAssignOpen(false);
      assignForm.resetFields();
      if (selectedYardId) loadSlots(selectedYardId);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg || t('yards.slotAssignFailed'));
    }
  };

  const onReleaseSlot = async () => {
    if (!selectedSlotId) return;
    try {
      await yardsApi.releaseSlot(selectedSlotId);
      message.success(t('yards.slotReleaseSuccess'));
      if (selectedYardId) loadSlots(selectedYardId);
    } catch {
      message.error(t('yards.slotReleaseFailed'));
    }
  };

  const enterMoveMode = () => {
    if (!selectedSlot || selectedSlot.status !== 'OCCUPIED') return;
    setMoveFromSlotId(selectedSlot.id);
    setMoveMode(true);
    message.info(t('yards.moveModeHint'));
  };

  const cancelMoveMode = () => {
    setMoveMode(false);
    setMoveFromSlotId(null);
  };

  const doMove = async (toSlot: YardSlot) => {
    if (!moveFromSlotId) return;
    try {
      await yardsApi.moveSlot(moveFromSlotId, toSlot.id);
      message.success(t('yards.moveSuccess'));
      setMoveMode(false);
      setMoveFromSlotId(null);
      setSelectedSlotId(toSlot.id);
      if (selectedYardId) loadSlots(selectedYardId);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg || t('yards.moveFailed'));
    }
  };

  const handleSlotClick = (slot: YardSlot) => {
    if (moveMode) {
      // 在移位模式：点了源本身取消；点占用格不动；点空格执行移位
      if (slot.id === moveFromSlotId) {
        cancelMoveMode();
        return;
      }
      if (slot.status === 'OCCUPIED') return;
      doMove(slot);
      return;
    }
    setSelectedSlotId(slot.id);
    // 点了新 slot 后，清理 URL 里的 highlightVin 避免下次访问再高亮
    if (initialHighlightVin) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('highlightVin');
      router.replace(`/yards?${params.toString()}`, { scroll: false });
    }
  };

  const grid = useMemo(() => {
    const parsed = slots
      .map((s) => ({ slot: s, parsed: parseSlotCode(s.code) }))
      .filter((p) => p.parsed) as Array<{ slot: YardSlot; parsed: { row: string; col: string } }>;
    if (parsed.length === 0) return null;
    const rowSet = Array.from(new Set(parsed.map((p) => p.parsed.row))).sort();
    const colSet = Array.from(new Set(parsed.map((p) => p.parsed.col))).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    const map = new Map<string, YardSlot>();
    for (const { slot, parsed: p } of parsed) {
      map.set(`${p.row}|${p.col}`, slot);
    }
    return { rows: rowSet, cols: colSet, map };
  }, [slots]);

  const filteredSlots = useMemo(() => {
    if (!vinFilter.trim()) return slots;
    const q = vinFilter.trim().toUpperCase();
    return slots.filter((s) => (s.currentVin ?? '').toUpperCase().includes(q));
  }, [slots, vinFilter]);

  const highlightSlotIds = useMemo(() => {
    if (!vinFilter.trim()) return new Set<string>();
    return new Set(filteredSlots.map((s) => s.id));
  }, [filteredSlots, vinFilter]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('yardBoard.title')}</h2>
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
      </div>

      {moveMode && (
        <Alert
          type="warning"
          message={t('yards.moveModeBanner')}
          action={<Button size="small" onClick={cancelMoveMode}>{t('yards.moveModeCancel')}</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      {selectedYard ? (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card>
                <Statistic
                  title={t('yards.statTotal')}
                  value={stats?.total ?? 0}
                  suffix={t('yards.statSlots')}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title={t('yards.statOccupied')}
                  value={stats?.occupied ?? 0}
                  suffix={t('yards.statOccupiedSuffix')}
                  valueStyle={{ color: '#16a34a' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title={t('yards.statVacant')}
                  value={stats?.vacant ?? 0}
                  suffix={t('yards.statVacantSuffix')}
                  valueStyle={{ color: '#eab308' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col flex="auto">
              <Space>
                <Input.Search
                  allowClear
                  style={{ width: 260 }}
                  placeholder={t('yards.vinSearchPlaceholder')}
                  value={vinFilter}
                  onChange={(e) => setVinFilter(e.target.value)}
                />
                {vinFilter && (
                  <span style={{ color: '#64748b' }}>
                    {t('yards.matchedCount', { n: filteredSlots.length })}
                  </span>
                )}
              </Space>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={16}>
              <Card title={t('yards.gridTitle', { code: selectedYard.code })}>
                {slotsLoading ? (
                  <Empty description={t('yards.slotsLoading')} />
                ) : slots.length === 0 ? (
                  <Empty description={t('yardBoard.noSlotsGoConfigure')} />
                ) : grid ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 8 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          {grid.cols.map((c) => (
                            <th key={c} style={{ padding: 4, color: '#64748b', textAlign: 'center' }}>
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grid.rows.map((r) => (
                          <tr key={r}>
                            <td style={{ padding: 4, color: '#64748b', fontWeight: 600 }}>{r}</td>
                            {grid.cols.map((c) => {
                              const slot = grid.map.get(`${r}|${c}`);
                              if (!slot) {
                                return (
                                  <td
                                    key={c}
                                    style={{
                                      width: 96,
                                      height: 72,
                                      border: '1px dashed #cbd5e1',
                                      borderRadius: 4,
                                    }}
                                  />
                                );
                              }
                              const isSelected = slot.id === selectedSlotId;
                              const isHighlighted = highlightSlotIds.has(slot.id);
                              const isMoveSource = slot.id === moveFromSlotId;
                              const isMoveTargetCandidate =
                                moveMode && slot.status === 'VACANT';
                              return (
                                <td
                                  key={c}
                                  onClick={() => handleSlotClick(slot)}
                                  style={{
                                    width: 96,
                                    height: 72,
                                    borderRadius: 6,
                                    backgroundColor: slotCellColor(slot.status),
                                    color: '#fff',
                                    padding: 8,
                                    cursor: 'pointer',
                                    outline: isMoveSource
                                      ? '2px solid #f97316'
                                      : isSelected
                                        ? '2px solid #3b82f6'
                                        : isHighlighted
                                          ? '2px solid #f59e0b'
                                          : isMoveTargetCandidate
                                            ? '2px dashed #38bdf8'
                                            : 'none',
                                    animation: isHighlighted
                                      ? 'pulse 1.2s ease-in-out infinite'
                                      : undefined,
                                    verticalAlign: 'top',
                                  }}
                                >
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                                    {slot.code}
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                                    {slot.status === 'OCCUPIED'
                                      ? slot.currentVin ?? t('yards.slotOccupied')
                                      : t('yards.slotVacant')}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <style jsx>{`
                      @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.6; }
                      }
                    `}</style>
                  </div>
                ) : (
                  <Space wrap>
                    {slots.map((s) => (
                      <Tooltip key={s.id} title={s.currentVin ?? t('yards.slotVacant')}>
                        <Tag
                          color={s.status === 'OCCUPIED' ? 'green' : 'default'}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleSlotClick(s)}
                        >
                          {s.code}
                        </Tag>
                      </Tooltip>
                    ))}
                  </Space>
                )}
              </Card>
            </Col>
            <Col span={8}>
              <Card title={t('yards.slotDetailTitle')}>
                {selectedSlot ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>{t('yards.slotCode')}: </span>
                      <strong>{selectedSlot.code}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>{t('yards.status')}: </span>
                      {selectedSlot.status === 'OCCUPIED' ? (
                        <Tag color="green">{t('yards.slotOccupied')}</Tag>
                      ) : (
                        <Tag>{t('yards.slotVacant')}</Tag>
                      )}
                    </div>
                    {selectedSlot.currentVin && (
                      <div>
                        <CarOutlined style={{ marginRight: 6 }} />
                        <span style={{ color: '#64748b' }}>VIN: </span>
                        <strong>{selectedSlot.currentVin}</strong>
                      </div>
                    )}
                    {selectedSlot.assignedAt && (
                      <div>
                        <span style={{ color: '#64748b' }}>{t('vinInventory.stayDays')}: </span>
                        {t('vinInventory.days', {
                          n: Math.floor(
                            (nowRef - new Date(selectedSlot.assignedAt).getTime()) /
                              86400000,
                          ),
                        })}
                      </div>
                    )}
                    <Space>
                      {selectedSlot.status === 'VACANT'
                        ? canAssign && (
                            <Button type="primary" onClick={() => setAssignOpen(true)}>
                              {t('yards.assignSlot')}
                            </Button>
                          )
                        : (
                          <>
                            {canMove && (
                              <Button
                                icon={<SwapOutlined />}
                                onClick={enterMoveMode}
                                disabled={moveMode}
                              >
                                {t('yards.moveVehicle')}
                              </Button>
                            )}
                            {canRelease && (
                              <Button danger onClick={onReleaseSlot}>
                                {t('yards.releaseSlot')}
                              </Button>
                            )}
                          </>
                        )}
                    </Space>
                  </Space>
                ) : (
                  <Empty description={t('yards.slotDetailEmpty')} imageStyle={{ height: 60 }} />
                )}
              </Card>
            </Col>
          </Row>
        </>
      ) : (
        <Empty description={t('yards.selectYardFirst')} />
      )}

      {/* 库位占用/扫码 */}
      <Modal
        title={t('yards.assignSlot')}
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        onOk={() => assignForm.submit()}
        destroyOnHidden
      >
        <Form form={assignForm} layout="vertical" onFinish={onAssignSlot}>
          <Form.Item
            label="VIN"
            name="vin"
            rules={[{ required: true, min: 8 }]}
            extra={t('yards.assignVinHint')}
          >
            <Input placeholder="LSVGB1234567890AB" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
