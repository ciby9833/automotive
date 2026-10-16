'use client';

import { useEffect, useState } from 'react';
import { Image, Space, message } from 'antd';
import { fetchSignedUrls } from '@/lib/api/storage';

export function AttachmentLink({ fileKey, children }: { fileKey: string; children: React.ReactNode }) {
  return <a href="#" onClick={async (event) => {
    event.preventDefault();
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const urls = await fetchSignedUrls([fileKey]);
      if (tab) tab.location.href = urls[fileKey];
    } catch { tab?.close(); message.error('Unable to open attachment'); }
  }}>{children}</a>;
}

export function AttachmentImages({ keys }: { keys: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signature = JSON.stringify(keys);
  useEffect(() => {
    let cancelled = false;
    void fetchSignedUrls(JSON.parse(signature)).then((result) => {
      if (!cancelled) setUrls(result);
    }).catch(() => { if (!cancelled) setUrls({}); });
    return () => { cancelled = true; };
  }, [signature]);
  return <Image.PreviewGroup><Space wrap size={6}>{keys.map((key) => urls[key] &&
    <Image key={key} src={urls[key]} alt="attachment" width={72} height={72} style={{ objectFit: 'cover' }} />
  )}</Space></Image.PreviewGroup>;
}

export interface AttachmentFile {
  key: string;
  name?: string;
  mime?: string;
}

const isImage = (f: AttachmentFile) =>
  f.mime ? f.mime.startsWith('image/') : !f.name || /\.(jpe?g|png|webp|gif)$/i.test(f.name);

/**
 * 照片和文件一起展示：图片放进同一个预览组（点缩略图全屏浏览、左右切换），PDF 等文件给链接，在新标签页打开。
 * 只在组件出现时才签名取图，适合放在点开才渲染的弹窗 / 抽屉里。
 */
export function AttachmentFiles({ files, size = 96 }: { files: AttachmentFile[]; size?: number }) {
  const images = files.filter(isImage);
  const others = files.filter((f) => !isImage(f));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signature = JSON.stringify(images.map((f) => f.key));
  useEffect(() => {
    const keys = JSON.parse(signature) as string[];
    if (!keys.length) return;
    let cancelled = false;
    void fetchSignedUrls(keys).then((result) => {
      if (!cancelled) setUrls(result);
    }).catch(() => { if (!cancelled) setUrls({}); });
    return () => { cancelled = true; };
  }, [signature]);
  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {images.length > 0 && (
        <Image.PreviewGroup>
          <Space wrap size={8}>
            {images.map((f) =>
              urls[f.key] ? (
                <Image
                  key={f.key}
                  src={urls[f.key]}
                  alt={f.name ?? 'photo'}
                  title={f.name}
                  width={size}
                  height={size}
                  style={{ objectFit: 'cover', borderRadius: 8 }}
                />
              ) : (
                <div key={f.key} style={{ width: size, height: size, borderRadius: 8, background: '#f2f2f7' }} />
              ),
            )}
          </Space>
        </Image.PreviewGroup>
      )}
      {others.map((f) => (
        <AttachmentLink key={f.key} fileKey={f.key}>
          {f.name ?? f.key}
        </AttachmentLink>
      ))}
    </Space>
  );
}
