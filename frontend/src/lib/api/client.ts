import axios, { CanceledError } from "axios";
import { useAuthStore } from "../auth/store";
import { useLayoutStore } from "@/components/layout/layoutStore";

declare module "axios" {
  interface InternalAxiosRequestConfig {
    sessionToken?: string | null;
  }
}
export const AUTHORIZATION_CHANGED = "authorization-changed";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  config.sessionToken = token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.config.sessionToken !== useAuthStore.getState().token)
      throw new CanceledError("Discarded response from a previous session");
    return response;
  },
  (error) => {
    // A delayed error from the previous organization must not log out the new one.
    if (
      error.config &&
      error.config.sessionToken !== useAuthStore.getState().token
    )
      return Promise.reject(
        new CanceledError("Discarded error from a previous session"),
      );
    if (error.response?.status === 401) {
      const code = error.response?.data?.code as string | undefined;
      const msg = error.response?.data?.message as string | undefined;
      // 后端返回"需要选机构"时，说明当前 token 是预授权 token；
      // 不清理登录状态，直接把用户送到机构选择页（登录页的 picker 会读 memberships 显示）
      const needsSelection =
        code === "AUTH_NEEDS_ORG_SELECTION" || msg?.includes("尚未选择机构");
      if (typeof window !== "undefined") {
        if (needsSelection) {
          window.location.href = "/select-org";
        } else {
          useAuthStore.getState().logout();
          useLayoutStore.getState().clearTabs();
          window.location.href = "/login";
        }
      }
    }
    if (
      error.response?.status === 403 &&
      error.config?.url !== "/auth/me" &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event(AUTHORIZATION_CHANGED));
    }
    return Promise.reject(error);
  },
);

// 后端统一用 TransformInterceptor 包了一层 { success, data }，这里统一拆包
export async function unwrap<T>(
  promise: Promise<{ data: { data: T } }>,
): Promise<T> {
  const res = await promise;
  return res.data.data;
}
