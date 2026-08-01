# APP 角色 · 功能对照

移动端专为**现场扫码**设计，不做管理类操作（导入 / 分派 / 报表 / 配置这些走网页端）。

## 各角色登录 App 主页看到的入口

后端 `role-permissions.ts` 里 role → permissions 映射决定了主页显示哪些入口。
App 主页调用 `PermissionManager.has(permission)` 逐项过滤。

| 角色 | 主页入口 | 用途 |
|---|---|---|
| **CARRIER_DRIVER**（司机） | 提货扫描 · 运单管理 | 司机主用户群。装车/启运/签收扫描藏在**运单详情**里，跟随 waybill.status 自动出现 |
| **CARRIER_STAFF**（承运商业务员） | 提货扫描 · 运单管理 | 承运商内部人员在 App 主要做调度回顾；账号/司机/车辆管理走网页端 |
| **YARD_STAFF**（场地业务员） | 入库扫描 · 运单管理 | 车到仓时扫 VIN 入库位；启运扫码也可以在这做 |
| **HQ_ADMIN / ORG_ADMIN** | 全部 | 管理员基本不常在 App，此处主要用于查看轨迹 / 授权诊断；管理动作走网页端 |
| **CUSTOMER** | 运单管理（只读） | 看自家在途车 |

## 运单详情里的扫描按钮（按 waybill.status 决定）

在 App 主页点"运单管理" → 选一单进入详情：

| Waybill 状态 | 出现的扫描按钮 |
|---|---|
| `NOT_ARRIVED`（未启运） | **装车扫描**（每 VIN 一张，需拍装车照）+ **整单启运**（全部装完 + 闸口照片） |
| `IN_TRANSIT`（运输中） | **签收扫描**（逐 VIN 签收，需拍签收照）+ **GPS 后台服务自动启动** |
| `ARRIVED`（已签收） | 只读 |

## GPS 后台采集

**触发**：司机进入某个 `IN_TRANSIT` 运单详情 → `DisposableEffect` 自动 start
`DriverLocationService` 前台服务；离开详情或运单变 `ARRIVED` → 自动 stop。

**采样**：`Google Maps 同款策略` —— 移动 30s、静止 2min（省电）。

**上传**：本地 buffer + 5min 批量 `POST /tracking/positions/batch`；断网时缓存在
Room（TODO）等联网后重放（当前 MVP 直接内存 buffer，重启丢失）。

**授权**：首次进入 IN_TRANSIT 运单时弹权限请求；用户拒绝后不影响业务流，只不采集。

## 三个"仅网页端"的入口（保留占位屏 + 明确文案）

以下即使角色权限允许，App 打开也只会看到"此功能在网页端使用"提示：
- **出库订单** — Excel 导入 + 开单需大屏、粘贴多列，移动端体验差
- **VIN 库存** — 整仓浏览带过滤/排序/导出，移动端不适合
- **入库导入 / 用户管理 / 场地配置** 等 — 未接入 App 路由，只在网页端

## 环境标识

登录页底部小字显示 `env: dev · http://10.0.2.2:3001`（或对应 flavor 的 URL）。
Debug/QA 排"到底连的哪个后端"时一眼看到。

## Flavor 打包

```bash
# 开发环境（本地 backend）
./gradlew assembleDevDebug

# 预发
./gradlew assembleStagingDebug

# 生产
./gradlew assembleProdRelease
```

`local.properties` 里的 `API_BASE_URL_DEV` 可覆盖 dev flavor 的 URL（比如
真机同 WiFi 需要用宿主 IP 而非 `10.0.2.2`）。
