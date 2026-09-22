# ALMS Android App

移动端项目路径：`/Users/ellis/Documents/automotive_alms/app/alms`

## 技术栈

- Kotlin
- Jetpack Compose
- Navigation Compose
- OkHttp
- Kotlin serialization

## 生产 APK 打包（macOS，2026-09-22 验证）

### 最简单的方法：只复制一行

1. 打开 Mac 的「终端」（可按 `Command + 空格`，搜索「终端」）。
2. 把下面**整行**复制到终端，按回车：

```bash
bash "/Users/ellis/Documents/automotive_alms/app/打包生产.command"
```

3. 等待完成，不需要输入其他命令。脚本会配置 Java、构建生产包、运行 Lint、验证签名；成功后自动在 Finder 里选中 APK。
4. 需要上传的是 Finder 选中的 **`app-prod-release.apk`**，不是源码文件夹，也不是旧的开发包。

也可以在 Finder 中打开仓库的 `app` 文件夹，双击「打包生产.command」。如果系统不允许直接打开，使用上面的一行终端命令即可。

当前准备的新版为 **1.3（versionCode 4）**。2026-09-22 检查线上公开版本接口，已发布版本为 **1.2（versionCode 3）**；之前本地 1.1（2）已落后，本次已修正。脚本不自动增加版本号，也不会上传发布。

### 手动执行方式（可选，不懂可跳过）

上面的一行命令已经包含以下步骤，不需要再重复执行：

```bash
cd /Users/ellis/Documents/automotive_alms/app/alms
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
"$JAVA_HOME/bin/java" -version
./gradlew :app:assembleProdRelease :app:lintProdRelease
```

注意：`app` 只是上层目录，Gradle 根目录是 `app/alms`。必须在包含 `gradlew` 的目录执行。上述 `export` 只影响当前终端，不修改系统配置；新开终端需再次执行。

本机使用 Android Studio 自带的 JBR 21.0.8，项目 Java/Kotlin 编译目标仍为 17。无需额外安装 Java，也无需修改业务代码。其他机器需安装兼容的 JDK、Android SDK Platform 36，并配置 `local.properties` 的 `sdk.dir`。

只有最后显示 `BUILD SUCCESSFUL`，才使用本次生成的文件；失败后目录里可能还留着旧 APK。

**生产 APK 路径：**

```text
/Users/ellis/Documents/automotive_alms/app/alms/app/build/outputs/apk/prod/release/app-prod-release.apk
```

Finder 打开输出目录：

```bash
open app/build/outputs/apk/prod/release
```

### 签名文件（必须保留）

生产构建使用现有签名，不要重新生成密钥，否则无法覆盖安装旧正式版。

```text
app/release/alms-prod.jks
app/release/keystore.properties
```

这些文件不纳入 Git；重新拉代码或换电脑后，需要从安全备份恢复。`keystore.properties` 包含 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`。相对的 `storeFile` 从仓库的 `app/` 目录解析，例如 `release/alms-prod.jks`；不要把密码写进教程或提交仓库。

当前 Gradle 配置在签名配置缺失时可能生成 unsigned APK。`BUILD SUCCESSFUL` 不等于已签名，发布前必须执行下面的签名核验。

### 产物核验

在同一个已设置 `JAVA_HOME` 的终端执行（其他机器按实际 SDK 路径、Build Tools 版本调整）：

```bash
/Users/ellis/Library/Android/sdk/build-tools/36.1.0/apksigner verify --verbose --print-certs \
  app/build/outputs/apk/prod/release/app-prod-release.apk

/Users/ellis/Library/Android/sdk/build-tools/36.1.0/aapt dump badging \
  app/build/outputs/apk/prod/release/app-prod-release.apk

shasum -a 256 app/build/outputs/apk/prod/release/app-prod-release.apk
```

- 签名检查应成功，且证书与既有正式版一致。
- 包名应为 `com.automotive.alms`，不能带 `.dev` / `.staging`；名称为 `ALMS`，不能是 debug 包。
- 当前代码版本为 `versionName = "1.3"`、`versionCode = 4`，高于本次查询到的线上正式版 1.2（3）。
- 每次发布**新版本**前，在 `app/build.gradle.kts` 中将 `versionCode` 改为大于已发布最大值的整数，并设置对应 `versionName`，然后重新打包。版本维护后台不允许重复上传相同版本号。

### 生产 API 地址

当前 `prod` 固定连接：

```text
http://8.215.32.251:8080/api
```

生产地址在 `app/build.gradle.kts` 的 `create("prod")` 内配置，**不会被** `local.properties` 或 `-PapiBaseUrl` 覆盖。可检查生成文件 `app/build/generated/source/buildConfig/prod/release/com/automotive/alms/BuildConfig.java`，确认 `FLAVOR = "prod"`、`DEBUG = false` 和 `API_BASE_URL`。

当前地址是 HTTP；正式环境建议后续配置 HTTPS 域名，本次打包未更换现有服务地址。打包只生成文件，不会自动上传、替换线上版本或发布到应用商店。发布步骤见 [安装包发布与分发](../../docs/app-release-distribution.md)。

## 开发 / 预发打包

同样先进入 `app/alms` 并设置 `JAVA_HOME`，再选择完整变体名：

| 用途 | 命令 | APK 相对路径 |
| --- | --- | --- |
| 开发 | `./gradlew :app:assembleDevDebug` | `app/build/outputs/apk/dev/debug/app-dev-debug.apk` |
| 预发 | `./gradlew :app:assembleStagingDebug` | `app/build/outputs/apk/staging/debug/app-staging-debug.apk` |
| 生产 | `./gradlew :app:assembleProdRelease` | `app/build/outputs/apk/prod/release/app-prod-release.apk` |

不要用未区分环境的 `assembleDebug` / `assembleRelease` 作为生产教程命令；它们可能构建多个环境。`compileDebugKotlin` 等简写还可能因多个 flavor 而产生歧义。

开发模拟器默认访问 `http://10.0.2.2:3001`。真机使用同 Wi-Fi 下电脑的局域网 IP，可在不提交 Git 的 `local.properties` 设置：

```properties
API_BASE_URL_DEV=http://192.168.x.x:3001
```

也可仅本次覆盖开发地址：

```bash
./gradlew :app:assembleDevDebug -PapiBaseUrl=http://192.168.x.x:3001
```

预发可用 `API_BASE_URL_STAGING` 或 `-PapiBaseUrl` 配置。默认预发地址是占位地址，不应直接用于实际业务。

## 常见打包问题

| 报错 / 现象 | 处理 |
| --- | --- |
| `Unable to locate a Java Runtime` | 当前终端未找到 Java，执行上面的 `export JAVA_HOME=...`，再打包。这是本机本次已复现的失败原因。 |
| `./gradlew: no such file or directory` | 当前目录不对，进入 `.../app/alms`，不是 `.../app`。 |
| Gradle task `ambiguous` / 构建了错误环境 | 使用完整任务名，例如 `:app:assembleProdRelease`。 |
| `SDK location not found` | 在 Android Studio 安装 SDK，恢复 `local.properties` 中正确的 `sdk.dir`。 |
| 缺少 keystore / 密码或 alias 错误 | 恢复原签名文件并核对配置；不要新建密钥或把 debug 包当正式包。 |
| 输出为 `*-unsigned.apk` | 没有应用 release 签名，先恢复 `app/release/keystore.properties`，再构建和核验。 |
| 发布提示版本号重复 | 递增 `versionCode` 后重新打包，重命名 APK 不会修改包内版本号。 |
| `deprecated` 警告 | 看最终是否 `BUILD SUCCESSFUL`；废弃 API 警告本身不是打包失败。 |

确需排查构建错误时，保留错误输出：

```bash
./gradlew :app:assembleProdRelease --stacktrace
```

通常不需要 `clean`。仅怀疑缓存/生成文件问题时使用 `./gradlew clean :app:assembleProdRelease`；`clean` 会删除本地构建产物，有需要保留的旧 APK 请先另存。

## 代码结构

```text
app/src/main/java/com/automotive/alms
├─ core
│  ├─ auth          登录态、SessionStore
│  ├─ config        AppContainer 依赖入口
│  ├─ model         Role、Permission、登录模型
│  ├─ navigation    AppRoute、NavHost
│  ├─ network       ApiClient、鉴权拦截器、错误模型
│  ├─ permission    PermissionManager
│  ├─ scanner       扫码公共模型
│  ├─ ui            主题、通用 Scaffold、尺寸
│  └─ upload        上传公共模型
└─ feature
   ├─ auth          登录、机构选择
   ├─ home          权限驱动工作台
   ├─ inbound       入库扫描模块
   ├─ pickup        提货扫描模块
   ├─ waybill       运单模块
   ├─ yard          VIN 库存/库位模块
   └─ outbound      出库订单模块
```

## 架构约定

- 页面不直接拼 HTTP 请求，业务接口放到对应 feature 的 `data` 层。
- 首页入口由后端返回的 `permissions` 驱动，不按角色硬编码菜单。
- 登录后如果返回 `NEEDS_SELECTION`，必须进入机构选择页，调用 `/auth/select-org` 换完整 token。
- 外部账号直接进入工作台，不走机构选择。
- 扫码、上传、错误解析、权限判断放在 `core`，不要复制到各业务页面。
