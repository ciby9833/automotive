export interface ApkMetadata {
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdkVersion: number | null;
  targetSdkVersion: number | null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

export async function inspectApk(file: File): Promise<ApkMetadata> {
  const parser = await import("@alms/apk-wasm");
  await parser.default();
  const parsed = JSON.parse(
    parser.parse_apk_with_options(
      new Uint8Array(await file.arrayBuffer()),
      JSON.stringify({
        signing: false,
        resources: true,
        icons: false,
        nativeAbi: false,
        resolveRefs: true,
      }),
    ),
  ) as {
    data?: { platformInfo?: { manifest?: Record<string, unknown> } };
  };
  const manifest = parsed.data?.platformInfo?.manifest;
  if (!manifest) throw new Error("Not an Android APK");
  const packageName = toStringValue(manifest.package);
  const versionName = toStringValue(manifest.versionName);
  const versionCode = toPositiveInteger(manifest.versionCode);
  if (!packageName || !versionName || versionCode === null) {
    throw new Error("Missing APK manifest metadata");
  }

  return {
    packageName,
    versionName,
    versionCode,
    minSdkVersion: toPositiveInteger(manifest.minSdkVersion),
    targetSdkVersion: toPositiveInteger(manifest.targetSdkVersion),
  };
}
