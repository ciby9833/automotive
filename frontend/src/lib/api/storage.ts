import { apiClient, unwrap } from './client';

// 后端返回的 URL 是相对路径 (/storage/preview/xxx)；拼上 API baseURL 变成浏览器可直接放到 <img src> 的绝对 URL
// 之所以走 apiClient.defaults.baseURL 而不是硬编码：本地开发/生产/测试环境 API 域名可能不同
function absolutize(url: string): string {
  if (!url) return url;
  if (/^https?:/i.test(url)) return url; // 兼容旧数据 (直接是 MinIO signed URL)
  const base = apiClient.defaults.baseURL ?? '';
  return `${base}${url}`;
}

// 上传单个文件到 MinIO；后端返回 key + 相对 URL；前端拼绝对 URL 后返回
export async function uploadFile(file: File): Promise<{ key: string; url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await unwrap<{ key: string; url: string }>(
    apiClient.post('/storage/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
  return { key: res.key, url: absolutize(res.url) };
}

// 拉一批 key 对应的图片访问 URL（现在走后端流转发路由，非直连 MinIO）
export async function fetchSignedUrls(
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const raw = await unwrap<Record<string, string>>(
    apiClient.post('/storage/signed-urls', { keys }),
  );
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, absolutize(v)]),
  );
}
