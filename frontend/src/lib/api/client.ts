import axios from 'axios';
import { useAuthStore } from '../auth/store';
import { useLayoutStore } from '@/components/layout/layoutStore';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const code = error.response?.data?.code as string | undefined;
      const msg = error.response?.data?.message as string | undefined;
      // 后端返回"需要选机构"时，说明当前 token 是预授权 token；
      // 不清理登录状态，直接把用户送到机构选择页（登录页的 picker 会读 memberships 显示）
      const needsSelection =
        code === 'AUTH_NEEDS_ORG_SELECTION' ||
        msg?.includes('尚未选择机构');
      if (typeof window !== 'undefined') {
        if (needsSelection) {
          window.location.href = '/select-org';
        } else {
          useAuthStore.getState().logout();
          useLayoutStore.getState().clearTabs();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

// 后端统一用 TransformInterceptor 包了一层 { success, data }，这里统一拆包
export async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}
