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
