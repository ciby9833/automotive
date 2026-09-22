#!/bin/bash
set -euo pipefail

# 可从任意目录执行；不打印签名配置或密码，不自动发布。
ALMS_APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ALMS_APP_DIR/alms"

if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME:-}/bin/java" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi
if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "找不到 Java。请安装 Android Studio，或把 JAVA_HOME 设置为已有的 JDK 路径。"
  exit 1
fi
if [[ ! -f "$ALMS_APP_DIR/release/keystore.properties" ]]; then
  echo "缺少 app/release/keystore.properties。请恢复原生产签名配置，不要重新生成签名。"
  exit 1
fi

echo "正在构建生产 APK 并运行检查，请等待 BUILD SUCCESSFUL。"
./gradlew :app:assembleProdRelease :app:lintProdRelease

ALMS_SDK_DIR="${ANDROID_HOME:-}"
if [[ -z "$ALMS_SDK_DIR" && -f local.properties ]]; then
  ALMS_SDK_DIR="$(sed -n 's/^sdk\.dir=//p' local.properties | head -n 1)"
fi
ALMS_SDK_DIR="${ALMS_SDK_DIR:-$HOME/Library/Android/sdk}"
ALMS_SIGNER=""
for ALMS_CANDIDATE in "$ALMS_SDK_DIR"/build-tools/*/apksigner; do
  if [[ -x "$ALMS_CANDIDATE" ]]; then ALMS_SIGNER="$ALMS_CANDIDATE"; fi
done
if [[ -z "$ALMS_SIGNER" ]]; then
  echo "APK 已构建，但找不到 apksigner，无法确认签名。请在 Android Studio 安装 SDK Build Tools 后重新执行。"
  exit 1
fi

ALMS_APK="$PWD/app/build/outputs/apk/prod/release/app-prod-release.apk"
# 未应用 release 签名时 Gradle 会输出 unsigned APK，不把旧签名包误当成本次结果。
if [[ -f "${ALMS_APK%.apk}-unsigned.apk" && "${ALMS_APK%.apk}-unsigned.apk" -nt "$ALMS_APK" ]]; then
  echo "本次产物未签名，请检查原生产签名配置。"
  exit 1
fi
"$ALMS_SIGNER" verify --verbose "$ALMS_APK"
"$(dirname "$ALMS_SIGNER")/aapt" dump badging "$ALMS_APK" | sed -n '1p'
shasum -a 256 "$ALMS_APK"
echo ""
echo "生产 APK 已完成，文件位置："
echo "$ALMS_APK"
echo "此脚本只打包，没有上传或发布。"
if [[ "${ALMS_OPEN_OUTPUT:-1}" == "1" ]]; then
  open -R "$ALMS_APK"
fi
