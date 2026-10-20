# 纯 A → B 运输

客户只买 A 点到 B 点的运输，车辆不进 J&T 场地：没有入库、库位、移库、出库。客户、地点、物流商、司机、拖车全部引用系统基础资料。

设计依据：《【汽车物流TMS】运输流程.pdf》、业务线下派单表，以及业务方 2026-09-16 / 09-18 / 09-30 / 10-14 几轮确认（见文末“业务规则”）。

## 核心模型：一台车一行

| 表 | 含义 |
| --- | --- |
| `transport_orders` | 需求单：一次客户委托（客户、客户订单号、计划日期）。状态由明细汇总，不另存计数。 |
| `transport_lines` | 明细：**一台车一行**。VIN 可空；发货地、收货地引用该客户的地点；车辆配置/型号/颜色；要求的拖车类型；按台分配的物流商；所属趟次。 |
| `transport_trips` | 趟次：一辆拖车跑一趟。可跨发货地、跨收货地、跨客户。载量取自拖车（默认 CC 6 / TANSYA 4 / DD 3 / TOWING 1）。 |
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
3. **派车**分两步（内部或承运商业务员）：
   - **按组确认**：导入时 Group 相同的车是一组，一组一张卡片、按导入批次分区。点选卡片后在底部浮动栏一键生成趟次——这一步只定物流商（组里没填 Vendor 的统一选一次），趟次状态为「待指派车辆」，载量先按拖车类型默认。
   - **指派车辆**：已确认的趟次按物流商分组列出，每趟在行内选司机和拖车（校验拖车类型和实车载量；拖车上还有未签收的车只提示）。现在多由 J&T 代物流商指派，物流商业务员登录后只看到自己的趟次。没指派的趟次不能提货、发车；司机端（App）也看不到。
   - **按明细**：逐台勾选、直接带司机和拖车派车，或把选中的车「设为组」，用于例外情况。可按组号筛选，一次选一个或多个组。
4. **提货**（司机 App / 网页）：扫 VIN。装车前校验拖车：同一拖车在别的趟次还有“已装车未签收”的车时，本趟不能装（提示占用的趟次号）。
   - 命中计划 VIN → 提货；
   - 本趟有空 VIN 明细 → 只有一条路线时自动绑定，多条路线时让司机选门店；
   - 属于别的需求单 → 提示先调整；
   - 系统里完全没有 → 登记为计划外车辆，内部可以顶替本趟一台、作为追加车辆加进需求单，或驳回（都要写原因）。未处理完不能发车。
5. **发车**：至少装 1 台。没装上的明细自动退回“待派车”，不阻塞发车。
6. **签收**：按门店逐台扫 VIN。每段上传一张 POD（PDF/JPG，≤20 MB）。拒收/退回的车由内部“关闭”。全部签收或关闭后趟次完成。
7. **更换 / 更正物流商**：提货前在趟次详情「更换物流商」（物流商、司机、拖车都可换，拖车类型须与本趟一致）；提货后只有内部能「更正物流商」（用于录错了的情况，必须填原因），会把本趟未确认的应付改到新物流商并按新报价重算，应付已确认则不能更正。
8. **代录**（内部，需派车权限）：司机扫不了码时，在趟次详情用“代录提货 / 代录签收”按明细批量补录——代录提货只能选待提货且已有 VIN 的车，代录签收只能选在途的车，必须填原因，可附现场照片，操作记录里单独标成 `内勤代录`。
9. **费用**：每台车签收时生成应收、应付各一条（代录签收同样生成）。

## 计价

- 应收：客户 + 发货地 + 门店或区域 + 拖车类型
- 应付：客户 + 物流商 + 发货地 + 门店或区域 + 拖车类型
- 查价顺序：门店价 → 门店所属区域的价 → 上级区域的价（如 Kota Bekasi → Jawa Barat），取最具体的一条。
- 报价有开始、结束日期，同一维度期间不能重叠；币种为客户所属机构默认币种。
- 匹配不到报价记 0 元（`UNPRICED`）。手工改价是单独的权限 `transport:finance-adjust`，只给总部（IT）管理员；机构财务只能“按报价重算”。改价必须填原因，金额标成 `MANUAL`。
- “按报价重算”只处理未确认的费用，默认保留手工调整过的金额。

## 权限

| 角色 | 网页 | App |
| --- | --- | --- |
| HQ / 机构管理员 | 需求单、调度、趟次、运输明细、异常、报价、费用 | 趟次 |
| 承运商业务员 | 分配给本承运商的明细（派车）、本承运商趟次 | 趟次 |
| 司机 | 本承运商趟次；账号绑定了司机档案时只看派给自己的 | 趟次 |
| 客户 | 自己的需求单（只读，含 POD） | — |

司机账号可在“承运商 → 账号”里绑定司机档案（承运商业务员和机构都能操作）。

## 区域（行政区划）

- `regions`：全机构共用的各国标准行政区划，按国家隔离。机构的 `organizations.country_code` 决定用哪个国家的区域（国家节点 ID/MY/TH/VN/PH 迁移时自动设置；总部、测试机构在「机构管理」里手动选）。
- 数据来源（`backend/src/database/data/admin-regions.ts`，由脚本生成）：
  - 印尼：Kepmendagri 2025，省 38 + 县/市 514（[cahyadsn/wilayah](https://github.com/cahyadsn/wilayah)）
  - 马来西亚 16 州/联邦直辖区、泰国 77 府（含曼谷）+ 芭提雅、菲律宾 17 大区 + 82 省：ISO 3166-2（[Debian iso-codes](https://salsa.debian.org/iso-codes-team/iso-codes)）
  - 越南：第 202/2025/QH15 号决议，2025-07-01 起 34 个省级单位（ISO 尚未更新，按决议录入）
- 客户地点挂 `region_id`；地址簿里按「省 → 县/市」树选择。Excel 导入的 Region 列可以填全称、代码（如 `32.75`）或常见简称（`DKI Jakarta`、`Bangkok`），重名（Kota/Kabupaten Bekasi）会要求写全称。`customer_addresses.region` 只是后端写入的区域名称，供老运单/出库页面显示。
- 迁移前的自由文本区域：能对上标准名称的直接挂上，对不上的（如 `GREATER JAKARTA`）保留为该国的「自定义区域」，原有报价照常生效；建议逐步把门店改挂到具体的县/市。
- 机构已有地点挂了区域后，不能再更换国家。
- 维护入口「系统管理 → 行政区划」（权限 `setup:region-manage`）：总部可维护所有国家，机构管理员只能维护本机构所在国家。可新增一级 / 二级行政区划（如新设立的县市）和自定义区域（可独立，也可挂在一级区域下），可改名；标准区划只能改名，不能改代码和层级。最多两级。有下级、有客户地点或报价在用的不能删除。改名会同步到客户地点上冗余的区域名称。上线时该菜单已自动授予有「机构管理」菜单的总部角色，机构管理员需在角色管理里授予。

## 对主数据和老流程的改动

均为可空或带默认值的新增字段，不影响现有入库、出库、运单：

- `customer_addresses.kind`：`STORE` 门店（默认，老数据全部为门店）/ `FACTORY` 工厂 / `YARD` 场地、RDC。老出库流程的门店编码匹配只匹配 `STORE`。
- `carrier_vehicles.capacity`：载量，空则按拖车类型默认。
- 拖车类型新增 `DD`（Double Drop，默认 3 台）：车辆、老运单、老出库明细的枚举和纯运输的约束都已加上，老出库计划也能选。
- `users.driver_id`：司机账号绑定司机档案，一个档案只能绑一个账号。
- `customers.code`：客户编号，机构内唯一（忽略大小写），Excel 导入按编号优先匹配客户。
- VIN 互斥：纯运输明细与旧 `waybill_vins` 共用 advisory lock，同一 VIN 不能同时在两边进行中；场地在库车辆必须走出库流程。

## 接口

全部在 `/transport` 下，Swagger：`/api-docs`。

- 需求单：`GET/POST /orders`、`GET /orders/:id`、`POST /orders/import`（`dryRun` 预览）、`POST /orders/:id/vins`、`POST /orders/:id/cancel`
- 明细：`GET /lines`（支持 `tripId`、`group`（可多个，逗号分隔）、`dateField`=orderCreated/plannedPickup/plannedDelivery/pickedUp/delivered + `from`/`to`、客户、起点、终点、物流商、状态；`timeline=true` 时带上需求单、分配、派车、发车时间和回单）、`GET /lines/export`（同样的条件，后端生成 Excel，最多 1000 台）、`PATCH /lines/:id`、`POST /lines/allocate`、`POST /lines/cancel`、`POST /lines/:id/close`、`GET /vins/:vin/history`
- 分组：`GET /groups`（待派车的组）、`POST /lines/group`（设为组 / 取消分组）
- 趟次：`GET/POST /trips`（`unassigned=true` 列出待指派车辆的趟次）、`POST /trips/batch`（按组确认，只给物流商即可，每组各自成败）、`/reassign`（指派车辆 / 提货前更换）、`/correct-carrier`（提货后更正并重算应付）、`GET /trips/:id`、`POST /trips/:id/lines`、`/lines/remove`、`/cancel`、`/pickup`、`/depart`、`/sign`、`/force-pickup`、`/force-sign`、`/exceptions`、`/documents`
- 异常：`GET /exceptions`、`POST /exceptions/:id/resolve`
- 区域：`GET /regions?organizationId=`（该机构所在国家的区域，前端按 `parent_id` 组树）
- 报价与费用：`GET/POST /tariffs`（`destinationId` 与 `destinationRegionId` 二选一）、`PATCH/DELETE /tariffs/:id`、`GET /charges`、`PATCH /charges/:id`、`POST /charges/confirm`、`POST /charges/recalculate`

## 列表查询与导出

- 需求单、调度（按明细）、趟次、运输明细四个列表默认只查最近一个月（需求单 / 调度 / 运输明细按需求单日期，趟次按趟次创建日期），清空日期即可查全部；日期按机构运营时区算。
- 每页 20 / 50 / 100 / 300 条可选，默认 50。
- 每个列表都能导出 Excel，条件与当前查询一致：需求单、趟次、调度明细一次最多 5000 行；运输明细带签收照片，一次最多 1000 台。

## 运输明细与导出

- 运输明细默认只看最近 30 天的需求单（按需求单日期），清空日期可看全部；「已签收」列显示签收时间，点「照片 / 回单」才加载签收照片和该段的回单。
- 导出由后端按当前筛选生成：需求单号、客户订单号、客户、VIN、始发地、目的地、供应商、拖车类型、趟次、状态、需求单时间、分配物流商、派车、提货、发车、签收时间、回单文件名，以及最多 3 张签收照片。
- 照片从存储里取原图、压成约 200×150 的缩略图**嵌在表格里**（预览链接只有 15 分钟，放链接会过期）；单张失败只留空，不影响整张表。
- 一次最多 1000 台，超过会提示缩小日期范围；时间按机构运营时区显示；表头跟随界面语言（中文 / English / Indonesia）。

## Excel 模板

列：`Customer, CustomerRequestNo, VIN, Quantity, Origin, Dealer, Type, Model, Color, Armada, Vendor, Group, PlannedPickupDate, PlannedDeliveryDate, Remark`。也识别线下表的“发货地址名称-Origin”这类中英文表头。

- 一行一台车；没有 VIN 时填 Quantity（1–500）。
- Origin / Dealer 填客户地址簿编码；Vendor 填物流商简称或名称；Armada 接受 `CC / TANSYA / tansa / DD / Double Drop / TOWING`。
- 填了 Vendor 必须同时填 Armada。
- PlannedPickupDate / PlannedDeliveryDate：填了就按填的，没填就留空。Excel 日期格子按日期序列号直接换算（不受时区影响）；文本认 `2026-10-21`、`2026/10/21`、`21/10/2026`、`21-10-2026`（斜杠 / 横线前面两位是日），带时间的只取日期；不存在的日期（如 2026-02-30）逐行报错。
- Group（如 CC1、CC2、TANSYA1）：同组 = 同一趟车，可跨订单号、跨客户。同组必须同一拖车类型（填了 Group 必须填 Armada）、同一物流商（只有部分行填了 Vendor 的，其余跟着组走），台数不超过该类型默认载量（CC 6 / TANSYA 4 / DD 3 / TOWING 1），否则报错。组号只在本次导入内有效，每天都可以从 CC1 开始写。
- Customer 填客户编号或客户名称；留空时用导入弹窗里选的默认客户。一个文件可以同时导多个客户、多个订单号。
- 同一（客户 + CustomerRequestNo）合并为一张需求单；客户订单号在同一客户下重复会拒绝。

## 业务规则（业务方确认）

- 物流商、拖车类型按台指定。
- 一趟车可以跨发货地、跨收货地，也可以拼不同客户的车。
- POD 按整趟算：同起点同终点 1 张；N 个起点同一终点 N 张；同一起点 N 个终点 N 张。
- 起点、终点只能选该客户已维护的门店、工厂、场地。
- 货损、拒收只做记录，不参与扣款或报价。
- 司机账号可由承运商业务员或 J&T 创建。
- 09-30 追加：导入模板带客户列、一个文件多客户多订单号；内勤可代录提货/签收并附照片；运输明细按 VIN 列出、按日期类型筛选并导出；拖车可提前排多趟，装车时才拦截；手工改价只给总部（IT）管理员。
- 10-14 追加（调度）：导入时按 Group 分组；派车拆成「按组确认（定物流商）」和「指派车辆（司机、拖车）」两步，现在由 J&T 指派，以后由物流商业务员在系统里指派；提货前可更换物流商，提货后由内部更正并自动重算应付；组超载量直接报错。
- 10-14 追加：应收、应付都支持区域价，门店价优先、区域价兜底；区域用各国标准行政区划（每个国家用自己的）；拖车类型加 DD（Double Drop，3 台），老出库/运单也能选。

## 部署与验证

迁移：`1789600000000-PureTransport.ts`（会清掉早期原型的 `transport_tasks / planned_vins / actual_vins` 表，这些表从未上线）、`1790500000000-TransportFeedback0930.ts`（客户编号字段与唯一索引；删掉“一辆拖车/一个司机只能有一个未完成趟次”的唯一索引）、`1790600000000-RegionsAndDoubleDrop.ts`（区域表与种子数据、地点/报价改挂 region_id、机构国家、DD）、`1790700000000-TransportDispatchGroups.ts`（明细的派车组与批次）、`1790800000000-TripVehicleAssignment.ts`（趟次的司机、拖车可以先空着，提货前必须指派）、`1790900000000-TransportEventLineIndex.ts`（按车查动作时间的索引）、`1791000000000-TransportDocumentNames.ts`（修正乱码的回单文件名）、`1791100000000-RegionManageMenu.ts`（行政区划菜单授予总部角色）。

后端新增依赖 `exceljs`（生成带图片的 Excel）和 `sharp`（缩略图）：部署时需要在服务器上执行 `npm install`，`sharp` 会按服务器平台下载预编译包。保持 `DB_SYNCHRONIZE=false`，先备份再执行：

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
