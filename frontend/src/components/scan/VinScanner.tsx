'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Space, message } from 'antd';
import { CameraOutlined, EditOutlined } from '@ant-design/icons';
import type { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  onCancel?: () => void;
  minLength?: number;
  placeholder?: string;
  confirmLabel?: string;
}

// 相机扫 VIN 码 + 手动输入回退
// html5-qrcode 支持 code128/qr/data-matrix/等常见格式，VIN 码通常是 code128
export function VinScanner({
  onScan,
  onCancel,
  minLength = 8,
  placeholder = '手动输入 VIN',
  confirmLabel = '确认 VIN',
}: Props) {
  const [mode, setMode] = useState<'idle' | 'camera'>('idle');
  const [manual, setManual] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const divId = 'vin-scanner-region';

  useEffect(() => {
    if (mode !== 'camera') return;
    let stopped = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode(divId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 100 }, aspectRatio: 2 },
          (decoded) => {
            if (stopped) return;
            const clean = decoded.trim().toUpperCase();
            if (clean.length >= minLength) {
              stopped = true;
              scanner.stop().catch(() => undefined);
              onScan(clean);
            }
          },
          () => undefined,
        );
      } catch {
        message.error('相机启动失败，请手动输入');
        setMode('idle');
      }
    })();

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [mode, onScan, minLength]);

  if (mode === 'camera') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div id={divId} style={{ width: '100%', maxWidth: 480, margin: '0 auto' }} />
        <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 12 }}>
          将 VIN 条码放入取景框
        </div>
        <Button style={{ marginTop: 12 }} onClick={() => setMode('idle')}>
          取消扫描
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button
          type="primary"
          size="large"
          block
          icon={<CameraOutlined />}
          onClick={() => setMode('camera')}
        >
          相机扫码
        </Button>
        <div style={{ color: '#94a3b8', textAlign: 'center', margin: '8px 0' }}>
          或
        </div>
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value.trim().toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manual.length >= minLength) onScan(manual);
          }}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 16,
            border: '1px solid #d1d5db',
            borderRadius: 6,
            textTransform: 'uppercase',
          }}
        />
        <Button
          block
          size="large"
          icon={<EditOutlined />}
          disabled={manual.length < minLength}
          onClick={() => onScan(manual)}
        >
          {confirmLabel}
        </Button>
        {onCancel && (
          <Button block onClick={onCancel}>
            取消
          </Button>
        )}
      </Space>
    </div>
  );
}
