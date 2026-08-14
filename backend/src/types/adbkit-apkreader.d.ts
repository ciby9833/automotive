declare module '@devicefarmer/adbkit-apkreader' {
  interface AndroidManifest {
    package?: unknown;
    versionName?: unknown;
    versionCode?: unknown;
    usesSdk?: {
      minSdkVersion?: unknown;
      targetSdkVersion?: unknown;
    } | null;
  }

  interface ApkReaderInstance {
    readManifest(): Promise<AndroidManifest>;
  }

  const ApkReader: {
    open(apk: Buffer | string): Promise<ApkReaderInstance>;
  };

  export default ApkReader;
}
