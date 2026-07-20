# ALMS Android App

移动端项目路径：`/Users/ellis/Documents/automotive_alms/app/alms`

## 技术栈

- Kotlin
- Jetpack Compose
- Navigation Compose
- OkHttp
- Kotlin serialization

## 运行

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

Android 模拟器访问本机后端默认使用：

```text
http://10.0.2.2:3001
```

配置位置：`app/build.gradle.kts` 的 `API_BASE_URL`。

如果使用真机，需要改成电脑在局域网内的 IP，例如：

```text
http://192.168.x.x:3001
```

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
