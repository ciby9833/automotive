'use client';

import { useEffect, useState } from 'react';
import { AutoComplete, Button, Space, Spin, Tag, message } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import { yardsApi, YardSlot } from '@/lib/api/yards';

interface Props {
  yardId: string | null;
  value?: string;
  onChange: (slotCode: string) => void;
  onCancel?: () => void;
}

// 库位选择器：从后端拉指定场地的空置库位 → 支持搜索 + 手动输入
// 未来物理库位贴了 QR 码，可以在这个组件里加相机扫码入口
export function SlotPicker({ yardId, value, onChange, onCancel }: Props) {
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    if (!yardId) return;
    setLoading(true);
    yardsApi
      .slots(yardId)
      .then((list) => setSlots(list.filter((s) => s.status === 'VACANT' && !s.isLocked)))
      .catch(() => message.error('加载库位失败'))
      .finally(() => setLoading(false));
  }, [yardId]);

  const options = slots.map((s) => ({
    value: s.code,
    label: (
      <Space>
        <Tag color="default">{s.code}</Tag>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          行 {s.row ?? '-'} 号 {s.slotNo ?? '-'}
        </span>
      </Space>
    ),
  }));

  const submit = () => {
    const clean = text.trim().toUpperCase();
    if (clean.length === 0) {
      message.warning('请选择或输入库位码');
      return;
    }
    onChange(clean);
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          共 {slots.length} 个空置库位可选，也可手动输入
        </div>
        <AutoComplete
          value={text}
          onChange={(v) => setText(v)}
          options={options}
          style={{ width: '100%' }}
          size="large"
          placeholder="搜索或直接输入库位码，如 A-01"
          filterOption={(input, option) => {
            const code = option?.value?.toString().toUpperCase() ?? '';
            return code.includes(input.toUpperCase());
          }}
          onSelect={(v) => setText(v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        {loading && <Spin size="small" />}
        <Button
          type="primary"
          size="large"
          block
          onClick={submit}
          disabled={!text.trim()}
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
