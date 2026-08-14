declare module "@alms/apk-wasm" {
  export function parse_apk_with_options(
    buffer: Uint8Array,
    optionsJson: string,
  ): string;

  export default function initialize(): Promise<WebAssembly.Exports>;
}
