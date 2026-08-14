import { apiClient, unwrap } from "./client";

export type AppReleaseStatus = "PUBLISHED" | "ARCHIVED" | "INVALIDATED";

export interface AppRelease {
  id: string;
  platform: "ANDROID";
  versionName: string;
  versionCode: number;
  releaseNotes: string | null;
  minimumSupportedVersionCode: number | null;
  forceUpdate: boolean;
  status: AppReleaseStatus;
  fileSize: number;
  sha256: string;
  packageName: string | null;
  minSdkVersion: number | null;
  targetSdkVersion: number | null;
  downloadCount: number;
  publishedAt: string;
  invalidatedAt: string | null;
  downloadPath: string;
  publishedBy?: { id: string; displayName: string } | null;
  invalidatedBy?: { id: string; displayName: string } | null;
}

export const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export function getAppDownloadUrl(release: Pick<AppRelease, "downloadPath">) {
  const value = `${apiBaseUrl}${release.downloadPath}`;
  if (/^https?:\/\//i.test(value) || typeof window === "undefined")
    return value;
  return new URL(value, window.location.origin).href;
}

export const appReleasesApi = {
  latest: () =>
    unwrap<AppRelease | null>(apiClient.get("/app-releases/public/latest")),
  list: () => unwrap<AppRelease[]>(apiClient.get("/app-releases")),
  publish: (data: FormData) =>
    unwrap<AppRelease>(
      apiClient.post("/app-releases", data, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    ),
  invalidate: (id: string) =>
    unwrap<AppRelease>(apiClient.post(`/app-releases/${id}/invalidate`)),
};
