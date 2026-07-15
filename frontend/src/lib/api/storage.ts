import { apiClient, unwrap } from './client';

// 上传单个文件到 MinIO；后端返回 key + 临时签名 URL
export async function uploadFile(file: File): Promise<{ key: string; url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return unwrap<{ key: string; url: string }>(
    apiClient.post('/storage/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
}

// 拉一批 MinIO key 对应的临时签名 URL。24h 过期，仅用于当次会话内展示
export async function fetchSignedUrls(
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  return unwrap<Record<string, string>>(
    apiClient.post('/storage/signed-urls', { keys }),
  );
}
