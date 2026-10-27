# 项目交接与踩坑记录

执行每个新任务前先阅读本文档；任务中遇到的实际问题及解决经验应及时补充，避免重复踩坑。

## 记录方式

每条记录包含：日期、相关模块或任务、问题与触发条件、原因、解决办法、预防措施及验证结果。

## 已记录的坑

### 2026-10-22：运输开放平台调研

完整分析见 [运输业务与开放平台方案](docs/transport-open-platform-2026-10-22.html)。本轮为代码与客户附件分析，未修改业务逻辑，未访问生产库、执行迁移或调用客户 API。

#### 提货剩余数存在重叠扣减（待修复）

- 位置：`backend/src/modules/inbound/inbound.service.ts` 的 `pickupOrderStats`（本轮第 1562 行起）及调用它的 `pickupOrderScan`。
- 问题：`remaining = total - pickedUp - arrived - cancelled`；同一 VIN 可以同时已提货、已到仓，两个计数不互斥，可能提前将提货订单置为 COMPLETED。
- 验证：独立 JavaScript 样例，3 台车中 A 已提且已到仓、B 已提、C 未提；现算式返回 0，按 VIN 实际判断应剩 1。只验证了算式，未在数据库复现。
- 建议处理：按每个 VIN 的“未提货且未到仓且未取消”条件统计 remaining，补充混合状态回归并核对受影响订单。此次未实施修复。
- 预防：对外回传不要把 pickupStatus=COMPLETED 当作运输送达；开放平台接入前先修正计数及状态来源。

#### 业务事实与客户接口不可直接等同

- 纯运输允许部分装车后发车；库存出库要求整单装齐。库存装车只释放库位，仍在场；只有启运才扣库存，签收不再次扣减。
- 库存前段现为订单分派和逐 VIN 提货记录，没有完整的提货趟次/车辆批次及独立发车节点。到货批次 `inbound_batches` 不能直接当实际装车批次。
- 纯运输完成可能包含 CLOSED（拒收/退回关闭）；旧运单 ARRIVED 在派送路径是全部 VIN 签收后的汇总结果，不能直接当独立到达事件。
- 验证依据：`transport-trips.service.ts`、`inbound.service.ts`、`waybills.service.ts`、`inventory.service.ts` 静态追踪；没有进行运行环境验收。
- 预防：统一外部资源和事件语义，保留内部各链业务规则；缺失的实际节点必须补采，不能用相近状态伪造。

#### 现有通知与文件预览不是可靠客户交付

- 旧运单在业务提交后才向队列发送通知，失败只记录日志；notification processor 目前只打印消息。提货部分入口的 VIN、订单、审计写入也不在同一事务。
- `StorageService.signedUrls` 是 15 分钟、绑定人员权限的相对预览链接，不适合直接作为客户长期保存的 POD URL。
- 预防方案：业务同事务 outbox、持久交付记录和独立 worker；新增机器应用文件授权。当前只是方案，尚未实现。

#### 客户 OTWB 文档尚不能直接作为联调契约

- 来源：`/Users/ellis/Downloads/08.10 运输状态回传.xlsx`，Sheet3。它仅描述 3PL/TMS → OTWB 的状态回传，没有提供下单/库存 API 或真实端点与鉴权。
- 已核实冲突：A29 的 `ShipmentNo` 与 B47 示例的 `shipmentNo`；E42 示例 `success` 与 F42 成功码 `000000`；G30 的状态 3/4 名称及 ATD 含义不一致。
- `flag=0` 写明全量覆盖，但覆盖范围、缺项删除、取消粒度、拆单跨批次和幂等均待客户确认。每个状态必须发 ETD/ETA，系统现有可空日期不能默补成真实时刻。
- 预防：先冻结双方确认的单号关系、状态、覆盖与回执规则；报文按客户授权切片，不把混装趟次其他客户数据发出。

### 2026-10-27：供应商管理 · 车辆载量与维护流程评估

#### 拖车默认载量散落多处，改一次容易漏（已修）

- 问题：TANSYA 默认载量从 4 改 5 时，发现默认值写在后端 `transport.rules.ts`，前端又在调度弹窗、车辆列表、拖车类型选项里各写死一份，另有一段写死数字的提示文案，共 5 处。
- 解决：前端统一到 `frontend/src/lib/fleet/towTypes.ts`（`DEFAULT_CAPACITY`、`vehicleCapacity`），其他组件全部引用它；车辆表单的载量框用占位文字显示所选类型的默认值，去掉写死数字的说明。
- 已建、未完成的 TANSYA 趟次在建趟时存了载量 4：迁移 `1791200000000-TansyaCapacityFive` 只把“载量来自默认值、未完成”的趟次改为 5，历史趟次和车辆单独填了载量的不动。
- 预防：改默认载量必须同时改后端 `transport.rules.ts` 和前端 `lib/fleet/towTypes.ts`，并考虑已建趟次存的快照值。
- 验证：后端单测 11/11；导入 TANSYA 一组 5 台通过、6 台报“超过 TANSYA 的载量 5 台”；车辆表单选 TANSYA 显示“默认 5”。

#### 删除车辆 / 司机会撞外键或丢历史（已修）

- 位置：`backend/src/modules/carriers/carriers.service.ts` 的 `deleteVehicle` / `deleteDriver`。
- 问题：删除前只检查旧运单 `NOT_ARRIVED`。`transport_trips.vehicle_id / driver_id` 是无级联外键，跑过纯运输的车或司机删除时数据库拒绝，全局异常过滤器不认 `QueryFailedError`，前端拿到 500；`waybills` 外键是 `ON DELETE SET NULL`，删除跑过旧运单的车会把历史运单上的车辆、司机清空。
- 解决：删除前统计纯运输趟次与旧运单（含历史，任何状态），司机另查是否绑定了司机账号；有记录一律拒绝并提示“请改为停用”。从没用过的仍可删除。
- 同批修复：拖车类型改为必填（新增必填，编辑不能清空）；同一物流商内车牌唯一（忽略空格大小写，停用的也算，提示直接启用）；供应商简称可在界面维护，机构内不能与别家的简称或全称重复（纯运输导入按“简称或全称”匹配物流商）；车队列表默认只看启用；载量为类型默认值时灰色显示。
- 注意：车牌、简称唯一是应用层校验，没有加数据库唯一索引（避免生产已有重复数据导致迁移失败）；并发同时提交理论上仍可能重复。
- 验证：接口验证 15/15（含跑过纯运输的拖车 / 司机删除返回 400 并提示停用、未使用的车可删、Vendor 填新简称可匹配）；页面确认简称列、默认只看启用、默认载量灰色。
- 性能：`transport_trips`、`waybills` 的 `vehicle_id / driver_id` 原来都没有索引（外键在 PostgreSQL 里不会自动建索引），删除检查和纯运输装车时的拖车占用检查都会全表扫。迁移 `1791300000000-FleetUsageIndexes` 用 `CREATE INDEX CONCURRENTLY` 补齐，并设 `transaction = false`（CONCURRENTLY 不能在事务里执行），生产上建索引期间不锁写。以后给大表加索引沿用这个写法。


#### 新增带参数的工作台标签页要改三处（供应商车队改独立页时踩到）

- 场景：供应商「司机车辆」从 960px 抽屉改为工作台标签页 `/carriers/:id/fleet`。
- 坑：只建 Next 路由 `app/(dashboard)/carriers/[id]/fleet/page.tsx` 不够。工作台内容不走 Next 路由渲染，而是 `workspaceRegistry.tsx` 按 tab key 渲染；`navModel.ts` 的 `resolveWorkspaceTab` 不认识这个路径时不会开标签，页面空白。
- 做法：同时改 ①路由页（导出可复用组件 + 默认页面）②`resolveWorkspaceTab` 用正则识别路径、给出 key 和 params ③`renderWorkspacePage` 按 key 渲染。权限沿用父菜单：`canAccessPath` 按路径前缀匹配到 `/carriers` 菜单的权限，不需要新加菜单。
- 注意：标签名取 i18n key，同类标签（多个供应商的车队）显示同名，和入库详情一致；页面标题里写供应商名区分。
- 同批：供应商列表每行只留「司机车辆」「账号」，编辑 / 改状态 / 生成邀请链接收进「⋮」菜单，改状态先弹确认（停用为红色）；`GenerateInviteButton` 拆出 `InviteModal` 供菜单打开；车队司机按姓名/电话/驾驶证、车辆按车牌搜索（忽略空格大小写，前端过滤，单个物流商车队量小）；账号抽屉宽度改为 `min(960px, 100vw)`。
