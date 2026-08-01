'use client';

import { useEffect, useState } from 'react';
import { Button, Select, Space, Spin, Tag, message } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import { yardsApi, YardSlot } from '@/lib/api/yards';
import { formatSlotCode } from '@/lib/slots';

interface Props {
  yardId: string | null;
  value?: string;
  onChange: (slot: YardSlot) => void;
  onCancel?: () => void;
}

// 库位选择器：从后端拉指定场地的空置库位 → 支持搜索 + 手动输入
// 未来物理库位贴了 QR 码，可以在这个组件里加相机扫码入口
export function SlotPicker({ yardId, value, onChange, onCancel }: Props) {
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(value ?? '');

  useEffect(() => {
    if (!yardId) return;
    setLoading(true);
    yardsApi
      .slots(yardId)
      .then((list) =>
        setSlots(
          list.filter(
            (s) => s.status === 'VACANT' && !s.isLocked && s.zoneIsActive,
          ),
        ),
      )
      .catch(() => message.error('加载库位失败'))
      .finally(() => setLoading(false));
  }, [yardId]);

  const options = slots.map((s) => ({
    value: s.id,
    searchText: formatSlotCode(s),
    label: (
      <Space>
        <Tag color="default">{formatSlotCode(s)}</Tag>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          {s.zoneName ? `${s.zoneName} · ` : ''}line {s.line} / row {s.row}
        </span>
      </Space>
    ),
  }));

  const submit = () => {
    const slot = slots.find((item) => item.id === selectedId);
    if (!slot) {
      message.warning('请选择库位');
      return;
    }
    onChange(slot);
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          共 {slots.length} 个空置库位可选
        </div>
        <Select
          value={selectedId || undefined}
          onChange={setSelectedId}
          options={options}
          style={{ width: '100%' }}
          size="large"
          placeholder="搜索库位编码"
          showSearch
          optionFilterProp="searchText"
          filterOption={(input, option) => {
            const code = option?.searchText?.toUpperCase() ?? '';
            return code.includes(input.toUpperCase());
          }}
        />
        {loading && <Spin size="small" />}
        <Button
          type="primary"
          size="large"
          block
          onClick={submit}
          disabled={!selectedId}
        >
          确认库位
        </Button>
        <Button
          block
          icon={<CameraOutlined />}
          disabled
          style={{ opacity: 0.4 }}
        >
          相机扫库位码（未来支持）
        </Button>
        {onCancel && (
          <Button block onClick={onCancel}>
            返回上一步
          </Button>
        )}
      </Space>
    </div>
  );
}
