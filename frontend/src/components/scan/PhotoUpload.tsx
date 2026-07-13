'use client';

import { useState } from 'react';
import { Button, Space, message } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { uploadFile } from '@/lib/api/storage';

interface Props {
  value?: string[];
  onChange: (keys: string[]) => void;
  minCount?: number;
  maxCount?: number;
}

// H5 拍照上传：相机 capture + MinIO 上传，返回 key 数组
export function PhotoUpload({ value = [], onChange, maxCount = 10 }: Props) {
  const [uploading, setUploading] = useState(false);

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (value.length + files.length > maxCount) {
      message.warning(`最多 ${maxCount} 张照片`);
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of Array.from(files)) {
        const res = await uploadFile(f);
        uploaded.push(res.key);
      }
      onChange([...value, ...uploaded]);
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const remove = (idx: number) => {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div>
      <Space wrap>
        {value.map((k, i) => (
          <div
            key={k}
            style={{
              position: 'relative',
              width: 80,
              height: 80,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              overflow: 'hidden',
              background: '#f3f4f6',
              fontSize: 10,
              padding: 4,
              wordBreak: 'break-all',
            }}
          >
            <span style={{ color: '#64748b' }}>#{i + 1}</span>
            <br />
            {k.slice(0, 18)}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ position: 'absolute', top: 0, right: 0 }}
              onClick={() => remove(i)}
            />
          </div>
        ))}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 80,
            height: 80,
            border: '1px dashed #cbd5e1',
            borderRadius: 6,
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.5 : 1,
          }}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={(e) => handlePick(e.target.files)}
          />
          <CameraOutlined style={{ fontSize: 22, color: '#94a3b8' }} />
        </label>
      </Space>
      {uploading && (
        <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 12 }}>
          上传中...
        </div>
      )}
    </div>
  );
}
