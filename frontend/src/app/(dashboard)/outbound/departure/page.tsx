'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import {
  CameraOutlined,
  CheckCircleFilled,
  ReloadOutlined,
  SendOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { VinScanner } from '@/components/scan/VinScanner';
import { PhotoUpload } from '@/components/scan/PhotoUpload';
import { waybillsApi, Waybill, WaybillStatus } from '@/lib/api/waybills';
import { useTranslation } from '@/i18n/useTranslation';

// 出库启运 (真实 FVL 两阶段)
// 阶段 1 装车：作业员对拖车上的每台车逐一扫 VIN + 拍装车照 (只写 WaybillVin.loadedAt)
// 阶段 2 出闸：全部装完后一次性"确认启运" → 释放 slot + waybill.status=IN_TRANSIT
export default function OutboundDeparturePage() {
  const { t } = useTranslation();

  // 列表状态
  const [statusFilter, setStatusFilter] = useState<'NOT_ARRIVED' | 'IN_TRANSIT' | 'ARRIVED'>(
    'NOT_ARRIVED',
  );
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(false);

  // 装车抽屉
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerWaybill, setDrawerWaybill] = useState<Waybill | null>(null);
  const [scanMode, setScanMode] = useState<{ vin: string } | null>(null);
  const [scanPhotos, setScanPhotos] = useState<string[]>([]);
  const [scanRemark, setScanRemark] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [gatePhotos, setGatePhotos] = useState<string[]>([]);
  const [gateRemark, setGateRemark] = useState('');
  const [departBusy, setDepartBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    waybillsApi
      .list({ status: statusFilter, transportType: 'DELIVERY' })
      .then(setRows)
      .catch(() => message.error(t('outbound.departure.loadFailed')))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // 抽屉里显示的运单：从最新 rows 里拿，装车动作后 reload 会同步刷新
  useEffect(() => {
    if (!drawerId) {
      setDrawerWaybill(null);
      return;
    }
    const found = rows.find((r) => r.id === drawerId);
    if (found) setDrawerWaybill(found);
  }, [drawerId, rows]);

  // 关键字过滤：运单号 / VIN / 目的门店 / 承运商 (前端做，避免加后端 filter 面条)
  const filteredRows = useMemo(() => {
    const k = keyword.trim().toUpperCase();
    if (!k) return rows;
    return rows.filter((w) => {
      if (w.waybillCode.toUpperCase().includes(k)) return true;
      if (w.customerWaybillCode?.toUpperCase().includes(k)) return true;
      if (w.vins.some((v) => v.vin.toUpperCase().includes(k))) return true;
      if (w.destinationDealer?.dealerName.toUpperCase().includes(k)) return true;
      if (w.carrier?.name.toUpperCase().includes(k)) return true;
      return false;
    });
  }, [rows, keyword]);

  const openDrawer = (w: Waybill) => {
    setDrawerId(w.id);
    setScanMode(null);
    setScanPhotos([]);
    setScanRemark('');
    setGatePhotos([]);
    setGateRemark('');
  };
  const closeDrawer = () => {
    setDrawerId(null);
    setScanMode(null);
  };

  const startScanFor = (vin: string) => {
    setScanMode({ vin });
    setScanPhotos([]);
    setScanRemark('');
  };
  const cancelScan = () => {
    setScanMode(null);
    setScanPhotos([]);
    setScanRemark('');
  };

  const submitLoad = async () => {
    if (!drawerWaybill || !scanMode) return;
    if (scanPhotos.length === 0) {
      message.warning(t('outbound.departure.needLoadPhoto'));
      return;
    }
    setScanBusy(true);
    try {
      await waybillsApi.loadVin(drawerWaybill.id, scanMode.vin, {
        photoKeys: scanPhotos,
        remark: scanRemark || undefined,
      });
      message.success(t('outbound.departure.loadedOne'));
      setScanMode(null);
      setScanPhotos([]);
      setScanRemark('');
      reload();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.departure.loadFailed'));
    } finally {
      setScanBusy(false);
    }
  };

  const undoLoad = async (vin: string) => {
    if (!drawerWaybill) return;
    try {
      await waybillsApi.unloadVin(drawerWaybill.id, vin);
      message.success(t('outbound.departure.undoLoadOk'));
      reload();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.departure.undoLoadFailed'));
    }
  };

  const submitDepart = async () => {
    if (!drawerWaybill) return;
    setDepartBusy(true);
    try {
      await waybillsApi.depart(drawerWaybill.id, {
        gatePhotoKeys: gatePhotos.length > 0 ? gatePhotos : undefined,
        remark: gateRemark || undefined,
      });
      message.success(t('outbound.departure.departedOk'));
      closeDrawer();
      reload();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.departure.departFailed'));
    } finally {
      setDepartBusy(false);
    }
  };

  const statusTagColor: Record<WaybillStatus, string> = {
    NOT_ARRIVED: 'gold',
    IN_TRANSIT: 'blue',
    ARRIVED: 'green',
  };

  const loadedCount = (w: Waybill) =>
    w.vins.filter((v) => v.loadedAt).length;

  return (
    <div>
      <PageHeader
        title={t('outbound.departure.title')}
        subtitle={t('outbound.departure.subtitle')}
      />

      <Card>
        <Space
          size="middle"
          style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}
        >
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as typeof statusFilter)}
            options={[
              { label: t('outbound.departure.tabPending'), value: 'NOT_ARRIVED' },
              { label: t('outbound.departure.tabInTransit'), value: 'IN_TRANSIT' },
              { label: t('outbound.departure.tabArrived'), value: 'ARRIVED' },
            ]}
          />
          <Space>
            <Input.Search
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('outbound.departure.searchPlaceholder')}
              allowClear
              style={{ width: 320 }}
            />
            <Button icon={<ReloadOutlined />} onClick={reload}>
              {t('common.refresh')}
            </Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filteredRows}
          columns={[
            {
              title: t('outbound.departure.waybillCode'),
              dataIndex: 'waybillCode',
              width: 200,
            },
            {
              title: t('outbound.departure.status'),
              width: 100,
              render: (_, w: Waybill) => (
                <Tag color={statusTagColor[w.status]}>
                  {t(`outbound.departure.status_${w.status}`)}
                </Tag>
              ),
            },
            {
              title: t('outbound.departure.progress'),
              width: 180,
              render: (_, w: Waybill) => {
                const done = loadedCount(w);
                const total = w.vins.length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <Space size={6}>
                    <Progress
                      percent={pct}
                      size="small"
                      style={{ width: 100 }}
                      status={done === total && total > 0 ? 'success' : 'active'}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {done}/{total}
                    </span>
                  </Space>
                );
              },
            },
            {
              title: t('outbound.departure.originYard'),
              render: (_, w: Waybill) =>
                w.originYard?.name ?? w.originText ?? '-',
            },
            {
              title: t('outbound.departure.dealer'),
              render: (_, w: Waybill) =>
                w.destinationDealer?.dealerName ?? '-',
            },
            {
              title: t('outbound.departure.carrier'),
              render: (_, w: Waybill) => w.carrier?.name ?? '-',
            },
            {
              title: '',
              width: 130,
              render: (_, w: Waybill) => {
                if (w.status !== 'NOT_ARRIVED') {
                  return (
                    <Button size="small" onClick={() => openDrawer(w)}>
                      {t('outbound.departure.view')}
                    </Button>
                  );
                }
                return (
                  <Button
                    type="primary"
                    size="small"
                    icon={<CameraOutlined />}
                    onClick={() => openDrawer(w)}
                  >
                    {t('outbound.departure.loadAction')}
                  </Button>
                );
              },
            },
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Drawer
        title={
          drawerWaybill
            ? `${t('outbound.departure.drawerTitle')} · ${drawerWaybill.waybillCode}`
            : ''
        }
        open={!!drawerId}
        onClose={closeDrawer}
        width={720}
        destroyOnClose
      >
        {drawerWaybill && (
          <div>
            <Descriptions
              size="small"
              column={2}
              style={{ marginBottom: 16 }}
              items={[
                {
                  label: t('outbound.departure.originYard'),
                  children: drawerWaybill.originYard?.name ?? drawerWaybill.originText ?? '-',
                },
                {
                  label: t('outbound.departure.dealer'),
                  children: drawerWaybill.destinationDealer?.dealerName ?? '-',
                },
                {
                  label: t('outbound.departure.carrier'),
                  children: drawerWaybill.carrier?.name ?? '-',
                },
                {
                  label: t('outbound.departure.status'),
                  children: (
                    <Tag color={statusTagColor[drawerWaybill.status]}>
                      {t(`outbound.departure.status_${drawerWaybill.status}`)}
                    </Tag>
                  ),
                },
              ]}
            />

            {drawerWaybill.status !== 'NOT_ARRIVED' && (
              <Alert
                type="info"
                showIcon
                message={t('outbound.departure.readOnlyHint')}
                style={{ marginBottom: 16 }}
              />
            )}

            {/* 单台扫码面板：只有 NOT_ARRIVED 且未选中扫车才隐藏；选中某台车后显示扫码 UI */}
            {drawerWaybill.status === 'NOT_ARRIVED' && scanMode && (
              <Card
                size="small"
                title={`${t('outbound.departure.scanFor')} ${scanMode.vin}`}
                style={{ marginBottom: 16 }}
                extra={
                  <Button size="small" onClick={cancelScan}>
                    {t('common.cancel')}
                  </Button>
                }
              >
                <VinScanner
                  onScan={(v) => {
                    if (v.trim().toUpperCase() !== scanMode.vin.toUpperCase()) {
                      message.warning(t('outbound.departure.vinMismatch'));
                      return;
                    }
                    message.success(t('outbound.departure.vinConfirmed'));
                  }}
                  placeholder={t('outbound.departure.vinPlaceholder')}
                />
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 6, fontWeight: 500 }}>
                    {t('outbound.departure.loadPhoto')}{' '}
                    <Tag color="red">{t('outbound.departure.required')}</Tag>
                  </div>
                  <PhotoUpload value={scanPhotos} onChange={setScanPhotos} />
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    {t('outbound.departure.loadPhotoHint')}
                  </div>
                </div>
                <Input.TextArea
                  value={scanRemark}
                  onChange={(e) => setScanRemark(e.target.value)}
                  placeholder={t('outbound.departure.scanRemarkHint')}
                  rows={2}
                  style={{ marginTop: 12 }}
                />
                <Button
                  type="primary"
                  block
                  loading={scanBusy}
                  disabled={scanPhotos.length === 0}
                  onClick={submitLoad}
                  style={{ marginTop: 12 }}
                >
                  {t('outbound.departure.confirmLoadOne')}
                </Button>
              </Card>
            )}

            <Table
              size="small"
              rowKey="id"
              dataSource={drawerWaybill.vins}
              pagination={false}
              columns={[
                {
                  title: 'VIN',
                  dataIndex: 'vin',
                  width: 220,
                  render: (v: string, r) =>
                    r.loadedAt ? (
                      <Space size={4}>
                        <CheckCircleFilled style={{ color: '#22c55e' }} />
                        <span>{v}</span>
                      </Space>
                    ) : (
                      v
                    ),
                },
                {
                  title: t('outbound.departure.vehicle'),
                  render: (_, r) =>
                    [r.model, r.color].filter(Boolean).join(' / ') || '-',
                },
                {
                  title: t('outbound.departure.loadedAt'),
                  width: 160,
                  render: (_, r) =>
                    r.loadedAt ? new Date(r.loadedAt).toLocaleString() : '-',
                },
                {
                  title: '',
                  width: 140,
                  render: (_, r) => {
                    if (drawerWaybill.status !== 'NOT_ARRIVED') return null;
                    if (r.loadedAt) {
                      return (
                        <Popconfirm
                          title={t('outbound.departure.undoLoadTitle')}
                          onConfirm={() => undoLoad(r.vin)}
                        >
                          <Button size="small" danger icon={<UndoOutlined />}>
                            {t('outbound.departure.undoLoad')}
                          </Button>
                        </Popconfirm>
                      );
                    }
                    return (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CameraOutlined />}
                        onClick={() => startScanFor(r.vin)}
                      >
                        {t('outbound.departure.scanAndPhoto')}
                      </Button>
                    );
                  },
                },
              ]}
              locale={{ emptyText: <Empty description="-" /> }}
            />

            {/* 出闸确认：只有全部装完 + waybill 状态还是 NOT_ARRIVED 时激活 */}
            {drawerWaybill.status === 'NOT_ARRIVED' && (
              <Card
                size="small"
                title={t('outbound.departure.gateCardTitle')}
                style={{ marginTop: 16 }}
              >
                <div style={{ marginBottom: 8, fontWeight: 500 }}>
                  {t('outbound.departure.gatePhotoLabel')}{' '}
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    ({t('common.optional')})
                  </span>
                </div>
                <PhotoUpload value={gatePhotos} onChange={setGatePhotos} />
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {t('outbound.departure.gatePhotoHint')}
                </div>
                <Input.TextArea
                  value={gateRemark}
                  onChange={(e) => setGateRemark(e.target.value)}
                  placeholder={t('outbound.departure.gateRemarkHint')}
                  rows={2}
                  style={{ marginTop: 12 }}
                />
                <Popconfirm
                  title={t('outbound.departure.departConfirmTitle')}
                  description={t('outbound.departure.departConfirmHint', {
                    n: drawerWaybill.vins.length,
                  })}
                  onConfirm={submitDepart}
                  okText={t('outbound.departure.departOk')}
                  okButtonProps={{ danger: false }}
                  disabled={
                    loadedCount(drawerWaybill) !== drawerWaybill.vins.length
                  }
                >
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    size="large"
                    block
                    loading={departBusy}
                    disabled={
                      loadedCount(drawerWaybill) !== drawerWaybill.vins.length
                    }
                    style={{ marginTop: 12 }}
                  >
                    {loadedCount(drawerWaybill) === drawerWaybill.vins.length
                      ? t('outbound.departure.confirmDepart')
                      : t('outbound.departure.pendingLoads', {
                          n:
                            drawerWaybill.vins.length -
                            loadedCount(drawerWaybill),
                        })}
                  </Button>
                </Popconfirm>
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
