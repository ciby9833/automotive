# TMS · 汽车物流运输管理系统

面向 FVL (Finished Vehicle Logistics) 场景的多租户 TMS 系统。
覆盖入库 / 出库 / 场地 / 运单 / 财务 / 轨迹全流程。

## 技术栈

- **前端**: Next.js 16 · TypeScript · Ant Design · Zustand · SheetJS
- **后端**: NestJS · TypeORM · PostgreSQL 16 (PostGIS) · Redis · MinIO
- **权限**: JWT + Role + Permission 双层 · 多机构 scope 隔离
- **国际化**: 中/英/印尼 三语

## 目录结构

```
.
├── backend/            NestJS API 服务 (端口 3001)
├── frontend/           Next.js 前端 (端口 3000)
└── docker-compose.yml  PostgreSQL + Redis + MinIO 一键起
```

## 快速开始

### 1. 起中间件

```bash
docker compose up -d
```

### 2. 后端

```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```

### 3. 前端

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

访问 http://localhost:3000，默认账号 `admin / Admin@12345`。

## 业务模块

- **入库**: BYD Excel 导入 → 提货扫码 (可选) → 到仓扫码 + 拍照 + 车检
- **出库**: 客户 Excel → 开单 (选 VIN + 分配供应商) → 启运扫码 + SJ 凭证 → 签收扫码
- **场地**: yard/slot 管理 · 库存看板 · VIN 库存
- **权限角色**: HQ 管理员 / 机构管理员 / 场地业务员 / 客户 / 承运商业务员 / 承运商司机

## 开发提示

- 数据库 schema 变更走 migration: `npm run migration:generate` / `npm run migration:run`
- 本地开发 `DB_SYNCHRONIZE=true` 时会自动同步 schema，生产必须关掉
- 上传的照片/文件走 MinIO，接口 `/storage/upload` 返回 object key
