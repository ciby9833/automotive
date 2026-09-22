# 纯 A → B 运输

客户只买 A 点到 B 点的运输，车辆不进 J&T 场地：没有入库、库位、移库、出库。客户、地点、物流商、司机、拖车全部引用系统基础资料。

设计依据：《【汽车物流TMS】运输流程.pdf》、业务线下派单表，以及业务方 2026-09-16 / 09-18 两轮确认（见文末“业务规则”）。

## 核心模型：一台车一行

| 表 | 含义 |
| --- | --- |
| `transport_orders` | 需求单：一次客户委托（客户、客户订单号、计划日期）。状态由明细汇总，不另存计数。 |
| `transport_lines` | 明细：**一台车一行**。VIN 可空；发货地、收货地引用该客户的地点；车辆配置/型号/颜色；要求的拖车类型；按台分配的物流商；所属趟次。 |
| `transport_trips` | 趟次：一辆拖车跑一趟。可跨发货地、跨收货地、跨客户。载量取自拖车（默认 CC 6 / TANSYA 4 / TOWING 1）。 |
| `transport_exceptions` | 计划外 VIN（需内部处理）、货损、拒收（只记录）。 |
| `transport_documents` | POD，挂在趟次的“段”上：趟次内每个（发货地，收货地）组合一张。 |
| `transport_tariffs` / `transport_charges` | 报价与费用，和旧 `finance_records` 分开，互不影响。 |
| `transport_events` | 全部操作日志，按需求单、趟次、VIN 可查。 |

“只给数量”就是 N 行空 VIN 明细：补 VIN 按行填，或在提货扫码时自动绑定。

## 状态

明细：`UNALLOCATED 待分配 → ALLOCATED 待派车 → DISPATCHED 待提货 → PICKED_UP 已装车 → IN_TRANSIT 运输中 → DELIVERED 已签收`，旁支 `CLOSED`（拒收/退回，内部关闭）与 `CANCELLED`（提货前取消）。

趟次：`PLANNED → LOADING → IN_TRANSIT → COMPLETED`，启运前可 `CANCELLED`。

需求单：还有未结束明细为 `OPEN`，全部签收/关闭为 `COMPLETED`，全部取消为 `CANCELLED`。

## 操作流程

1. **建单**（内部）：网页手工建单，或 Excel 导入（先预览、逐行报错，确认后整个文件一个事务落库）。发货地、收货地只能选该客户地址簿里的地点。
2. **分配**（内部）：在“调度”里按台指定物流商和拖车类型。Excel 里填了 Vendor + Armada 的行导入即分配。
3. **派车**（内部或承运商业务员）：勾选同一物流商、同一拖车类型的明细，选司机和拖车建趟次，或加到未发车的趟次。校验载量；一辆拖车、一个司机同一时间只能有一个未完成趟次。
4. **提货**（司机 App / 网页）：扫 VIN。
   - 命中计划 VIN → 提货；
   - 本趟有空 VIN 明细 → 只有一条路线时自动绑定，多条路线时让司机选门店；
   - 属于别的需求单 → 提示先调整；
   - 系统里完全没有 → 登记为计划外车辆，内部可以顶替本趟一台、作为追加车辆加进需求单，或驳回（都要写原因）。未处理完不能发车。
5. **发车**：至少装 1 台。没装上的明细自动退回“待派车”，不阻塞发车。
6. **签收**：按门店逐台扫 VIN。每段上传一张 POD（PDF/JPG，≤20 MB）。拒收/退回的车由内部“关闭”。全部签收或关闭后趟次完成。
7. **费用**：每台车签收时生成应收、应付各一条。

## 计价

- 应收：客户 + 发货地 + 收货门店 + 拖车类型
- 应付：客户 + 物流商 + 发货地 + 收货门店（优先）或目的区域（`customer_addresses.region`）+ 拖车类型
- 报价有开始、结束日期，同一维度期间不能重叠；币种为客户所属机构默认币种。
- 匹配不到报价记 0 元（`UNPRICED`），内部可手工调整（记原因）。
- “按报价重算”只处理未确认的费用，默认保留手工调整过的金额。

## 权限

| 角色 | 网页 | App |
| --- | --- | --- |
| HQ / 机构管理员 | 需求单、调度、趟次、异常、报价、费用 | 趟次 |
| 承运商业务员 | 分配给本承运商的明细（派车）、本承运商趟次 | 趟次 |
| 司机 | 本承运商趟次；账号绑定了司机档案时只看派给自己的 | 趟次 |
| 客户 | 自己的需求单（只读，含 POD） | — |

司机账号可在“承运商 → 账号”里绑定司机档案（承运商业务员和机构都能操作）。

## 对主数据和老流程的改动

均为可空或带默认值的新增字段，不影响现有入库、出库、运单：

- `customer_addresses.kind`：`STORE` 门店（默认，老数据全部为门店）/ `FACTORY` 工厂 / `YARD` 场地、RDC。老出库流程的门店编码匹配只匹配 `STORE`。
- `carrier_vehicles.capacity`：载量，空则按拖车类型默认。
- `users.driver_id`：司机账号绑定司机档案，一个档案只能绑一个账号。
- VIN 互斥：纯运输明细与旧 `waybill_vins` 共用 advisory lock，同一 VIN 不能同时在两边进行中；场地在库车辆必须走出库流程。

## 接口

全部在 `/transport` 下，Swagger：`/api-docs`。

- 需求单：`GET/POST /orders`、`GET /orders/:id`、`POST /orders/import`（`dryRun` 预览）、`POST /orders/:id/vins`、`POST /orders/:id/cancel`
- 明细：`GET /lines`、`PATCH /lines/:id`、`POST /lines/allocate`、`POST /lines/cancel`、`POST /lines/:id/close`、`GET /vins/:vin/history`
- 趟次：`GET/POST /trips`、`GET /trips/:id`、`POST /trips/:id/lines`、`/lines/remove`、`/cancel`、`/pickup`、`/depart`、`/sign`、`/exceptions`、`/documents`
- 异常：`GET /exceptions`、`POST /exceptions/:id/resolve`
- 报价与费用：`GET/POST /tariffs`、`PATCH/DELETE /tariffs/:id`、`GET /charges`、`PATCH /charges/:id`、`POST /charges/confirm`、`POST /charges/recalculate`

## Excel 模板

列：`CustomerRequestNo, VIN, Quantity, Origin, Dealer, Type, Model, Color, Armada, Vendor, PlannedPickupDate, PlannedDeliveryDate, Remark`。也识别线下表的“发货地址名称-Origin”这类中英文表头。

- 一行一台车；没有 VIN 时填 Quantity（1–500）。
- Origin / Dealer 填客户地址簿编码；Vendor 填物流商简称或名称；Armada 接受 `CC / TANSYA / tansa / TOWING`。
- 填了 Vendor 必须同时填 Armada。
- 同一 CustomerRequestNo 合并为一张需求单；客户订单号重复会拒绝。

## 业务规则（业务方确认）

- 物流商、拖车类型按台指定。
- 一趟车可以跨发货地、跨收货地，也可以拼不同客户的车。
- POD 按整趟算：同起点同终点 1 张；N 个起点同一终点 N 张；同一起点 N 个终点 N 张。
- 起点、终点只能选该客户已维护的门店、工厂、场地。
- 货损、拒收只做记录，不参与扣款或报价。
- 司机账号可由承运商业务员或 J&T 创建。

## 部署与验证

迁移：`1789600000000-PureTransport.ts`（会清掉早期原型的 `transport_tasks / planned_vins / actual_vins` 表，这些表从未上线）。保持 `DB_SYNCHRONIZE=false`，先备份再执行：

```sh
cd backend
npm run migration:run
npm run build
```

验证：

```sh
cd backend && npx jest src/modules/transport       # 规则单测
cd frontend && npx tsc --noEmit                     # 网页类型检查
cd app/alms && ./gradlew :app:assembleDevDebug      # App 构建
```
