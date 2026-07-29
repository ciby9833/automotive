# TMS 部署 SOP

生产部署指南 · 面向 Linux 服务器 (Ubuntu/Debian，其他发行版命令类同)。
适用场景：**服务器已跑其他服务，本项目与其隔离共存**。

---

## 部署策略

### 端口 & 服务分配

| 组件 | 端口 | 策略 |
|---|---|---|
| **PostgreSQL (docker)** | 15432 | docker 起（`tms-timescale-postgis`），只 bind 127.0.0.1 |
| **Redis (docker)** | 16379 | docker 起，只 bind 127.0.0.1 |
| **MinIO (docker)** | 19000 / 19001 | docker 起，只 bind 127.0.0.1 |
| **Backend (Node)** | 3081 | PM2 起，只 bind 127.0.0.1 |
| **Frontend (Node)** | 3080 | PM2 起，只 bind 127.0.0.1 |
| **Nginx 反代** | 8080 | 新加 site，暴露给公网 |

**访问入口**：`http://<服务器 IP>:8080`（未来加域名时改 nginx `server_name` + 加 SSL）。

### 与已有服务的隔离性

- Nginx 80/443 老站点不动，只新增 8080 server block
- 全部依赖 (PG/Redis/MinIO) 走 docker + 127.0.0.1 绑定，不对外暴露；也不与系统 PG（如果有）冲突（用 15432 端口区分）

---

## 前置条件

服务器安装：
- Node 20+
- Docker + Docker Compose
- PM2 (`npm i -g pm2`)
- Nginx

**PostgreSQL 通过 Docker 起** — 不再依赖系统 PG。生产镜像 `tms-timescale-postgis`
由 [Dockerfile.timescale-postgis](Dockerfile.timescale-postgis) 定义：基于
`timescale/timescaledb:2.17.2-pg17` 装 `postgis` 一次打全。原因：
- `yards.location` 用 PostGIS `geometry(Point,4326)`
- GPS 轨迹表 `driver_positions` 用 TimescaleDB hypertable
- 两个扩展系统 PG 都要单独 apt install，容易漏；打进 Docker 一次搞定

---

## 首次部署步骤

### 0. 目录准备

```bash
mkdir -p /var/www/automotive_alms/logs
cd /var/www/automotive_alms
```

### 1. 拉代码

```bash
git clone https://github.com/ciby9833/automotive.git .
```

### 2. 起 PostgreSQL + Redis + MinIO（全 Docker）

```bash
cd /var/www/automotive_alms

# 建 docker-compose 用的 env 文件（各种密码放这里，不进 git）
cat > deploy/.env <<'EOF'
DB_NAME=tms
DB_USER=tms
DB_PASSWORD=换成强密码
MINIO_ROOT_USER=tmsadmin
MINIO_ROOT_PASSWORD=换成强密码
EOF

# 首次会 build tms-timescale-postgis 镜像（约 30s），之后启动秒起
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker ps    # 确认 tms-postgres / tms-redis / tms-minio 都 Up
```

### 3. 确认扩展已就绪

```bash
docker exec -it tms-postgres psql -U tms -d tms -c \
  "CREATE EXTENSION IF NOT EXISTS postgis; \
   CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; \
   CREATE EXTENSION IF NOT EXISTS timescaledb;"

# 确认三个扩展都装好
docker exec -it tms-postgres psql -U tms -d tms -c \
  "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
# 期望看到 postgis / timescaledb / uuid-ossp
```

### 4. 配 backend `.env`

```bash
cd /var/www/automotive_alms/backend
cp .env.example .env
vim .env    # 按下面模板填
```

**backend/.env 生产配置**：

```env
PORT=3081
CORS_ORIGIN=http://<服务器 IP>:8080

JWT_SECRET=<用 openssl rand -hex 32 生成一个>
JWT_EXPIRES_IN=8h

# Docker PG (15432)
DB_HOST=127.0.0.1
DB_PORT=15432
DB_USERNAME=tms
DB_PASSWORD=<第 2 步的强密码>
DB_DATABASE=tms
DB_SYNCHRONIZE=false   # 生产必须 false

REDIS_HOST=127.0.0.1
REDIS_PORT=16379

STORAGE_DRIVER=minio
STORAGE_ENDPOINT=127.0.0.1
STORAGE_PORT=19000
STORAGE_USE_SSL=false
STORAGE_ACCESS_KEY=tmsadmin
STORAGE_SECRET_KEY=<第 3 步的 MinIO 密码>
STORAGE_BUCKET=tms-files
```

### 5. Backend build + 建表 + seed

```bash
cd /var/www/automotive_alms/backend
npm ci
npm run build
npm run migration:run
npm run seed    # 建默认管理员账号 admin/Admin@12345 + HQ/5 国家/示例场地/承运商/客户
```

**seed 幂等**：反复跑不会创建重复数据，会 skip 已存在项。

**seed 只建启动系统必要的骨架**（HQ + 5 国家机构 + 每机构运营策略 + admin），
所有业务实体（场地/库位/承运商/客户/司机等）都在 admin 登录后手动建。

**唯一初始账号 ⚠ 上线后立即改密码**：

| 用户名 | 密码 | 角色 |
|---|---|---|
| admin | Admin@12345 | HQ_ADMIN（万能） |

登录后依次建：
1. **系统管理 → 用户管理** 建 ORG_ADMIN / YARD_STAFF 等内部账号
2. **系统管理 → 场地配置 / 库位配置** 建场地和库位
3. **合作伙伴 → 供应商管理** 建承运商（可发邀请码给他们自建账号）
4. **合作伙伴 → 客户管理** 建客户及门店地址簿

### 6. 配 frontend `.env.production` + build

```bash
cd /var/www/automotive_alms/frontend
cat > .env.production <<'EOF'
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_WS_URL=/
EOF

npm ci
npm run build
```

> ⚠️ `NEXT_PUBLIC_*` 是**编译期**注入的，一定要在 `build` 之前配好。改环境变量需要重新 build。

### 7. PM2 启动

```bash
cd /var/www/automotive_alms
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root
# 按提示执行输出的 systemctl 命令
```

### 8. Nginx 反代

```bash
ln -s /var/www/automotive_alms/deploy/nginx-automotive.conf /etc/nginx/sites-available/automotive
ln -s /etc/nginx/sites-available/automotive /etc/nginx/sites-enabled/automotive
nginx -t
systemctl reload nginx
```

### 9. 云安全组

阿里云 / AWS / GCP 控制台：入方向放行 TCP 8080（生产建议只放公司 IP 段）。

### 10. 访问

浏览器打开 `http://<服务器 IP>:8080`，用 `admin / Admin@12345` 登录。

---

## 后续更新流程

```bash
cd /var/www/automotive_alms
git pull

# 后端：build 后跑 migration，然后 reload（graceful）
cd backend && npm ci && npm run build && npm run migration:run
pm2 reload tms-backend

# 前端：走安全升级脚本（不会触发用户端 chunk 404）
cd /var/www/automotive_alms
bash deploy/upgrade-frontend.sh
```

> ⚠️ **不要再用 `cd frontend && npm run build && pm2 restart tms-frontend`。**
> 直接覆盖 `.next` 会删掉老 hash chunk 文件，任何还开着页面的用户 tab 一操作就
> `This page couldn't load`（chunk 404）。用 `upgrade-frontend.sh` 才能保留老
> chunks 30 天，让已打开 tab 平滑过渡到新版本。

### 关于列名混用（`createdAt` vs `created_at`）

早期 prod 库是 `synchronize=true` 建的（列名 camelCase），后期 migration 用 snake_case。
`1785500000000-NormalizeTimestampColumns` 会一次性把 prod 库的所有 camelCase 时间列
rename 成 snake_case，dev 库自动 no-op。**跑过一次之后所有 raw SQL 只用 snake_case
即可。**

新写 migration 时如果需要引用 `created_at`/`updated_at`，直接用即可。
新写 entity 继承 `BaseEntity` 会自动带 `@CreateDateColumn({name:'created_at'})` 映射。

---

## 常见问题

| 症状 | 排查方法 |
|---|---|
| 502 Bad Gateway | `pm2 status` / `pm2 logs tms-backend` |
| API 404 | 确认 nginx `location /api/` 的 `proxy_pass` **末尾有斜杠** |
| 图片上传后 404 | `docker ps` 看 tms-minio Up；检查 `.env` 的 `STORAGE_ENDPOINT` |
| CORS 拒绝 | `backend/.env` 的 `CORS_ORIGIN` 是否包含实际访问入口 |
| DB 连不上 | `docker ps` 确认 `tms-postgres` Up；backend `.env` 的 `DB_PORT` 是否 15432；密码是否对得上 `deploy/.env` 里的 `DB_PASSWORD` |
| 迁移失败 · `column createdAt does not exist` | prod 里是 snake_case、dev 里是 camelCase 或反之 —— 检查是否漏跑 `NormalizeTimestampColumns` |
| 迁移失败 · `type "geometry" does not exist` | `docker exec -it tms-postgres psql -U tms -d tms -c "CREATE EXTENSION IF NOT EXISTS postgis;"` — 通常是新库忘装扩展 |
| 迁移失败 · `column ... already exists` | 幂等问题：老 migration 里 ADD COLUMN 与后续 CREATE TABLE 冲突。检查报错 migration，把 ALTER TABLE 改为 `ADD COLUMN IF NOT EXISTS`，重跑 `npm run migration:run` |
| PG 容器起不来 | `docker logs tms-postgres`；密码错、端口冲突（本机已占用 15432？）、volume 权限 |
| `This page couldn't load` + chunk 404 | 部署没走 `upgrade-frontend.sh`；同时前端已内置 ChunkErrorReloader，会自动 reload 一次 |
| 长期堆积老 chunk 文件 | `find /var/www/automotive_alms/frontend/.next/static -type f -mtime +30 -delete`（可放 cron 每周跑） |

---

## 目录结构约定

```
/var/www/automotive_alms/
├── backend/                  Nest.js 服务
├── frontend/                 Next.js 前端
├── deploy/
│   ├── docker-compose.prod.yml
│   ├── ecosystem.config.js   PM2 配置
│   ├── nginx-automotive.conf 站点配置
│   └── .env                  MinIO 密码 (不进 git)
└── logs/                     PM2 + Nginx 日志
```







## 完成教程说明
先建部署所需的辅助文件，再给完整命令。策略先讲清楚。

## 部署策略（不干扰已有服务）

### 端口 & 服务分配

| 组件 | 端口 | 冲突? | 策略 |
|---|---|---|---|
| **PostgreSQL (docker)** | 15432 | 需装 | docker 起（`tms-timescale-postgis`），bind 127.0.0.1 |
| **Redis (docker)** | 16379 | 无 | docker 起，只 bind 127.0.0.1 |
| **MinIO (docker)** | 19000 / 19001 | 无 | docker 起，只 bind 127.0.0.1 |
| **Backend (Node)** | 3081 | 无 | PM2 起，只 bind 127.0.0.1 |
| **Frontend (Node)** | 3080 | 无 | PM2 起，只 bind 127.0.0.1 |
| **Nginx 反代** | 8080 | 无 | 新加 site，暴露给公网 |
| 老服务 80/443 | | | ✋ 不动 |
| 老 Uvicorn 8000 | | | ✋ 不动 |

**访问入口**：`http://8.215.32.251:8080` (等有域名了再换)

---

### 建部署所需 3 个文件（本地建，随代码 push）

部署文件不是浏览器可观察的变化，跳过 verify。继续建 nginx 配置：

3 个部署辅助文件已建好。现在写完整 SOP。

## 📋 完整部署 SOP

### 第 0 步：本地把新加的文件推上 GitHub

```bash
cd /Users/ellis/Documents/automotive_alms
git add deploy/ README.md .gitignore   # README 和 .gitignore 之前已建
git status                              # 确认没 .env
git commit -m "chore: add deploy config (docker-compose.prod, pm2, nginx)"
git push
```

---

### 第 1 步：服务器前置检查

```bash
ssh -i ~/.ssh/cargo.pem -p 56222 root@8.215.32.251

# 检查 Node 版本，需要 20+ (nest 16 要求)
node -v
# 没有或版本低 → 装 nvm + node 20
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# source ~/.bashrc
# nvm install 20

# 检查 docker
docker -v
docker compose version

# 装 pm2
npm i -g pm2
```

---

### 第 2 步：拉代码到 `/var/www/automotive_alms`

```bash
cd /var/www/automotive_alms
# 你之前建了空 backend/frontend，先清掉再 clone（logs 保留）
rmdir backend frontend
git clone https://github.com/ciby9833/automotive.git .
ls   # 应该看到 backend/  frontend/  deploy/  docker-compose.yml  logs/  README.md
```

---

### 第 3 步：准备 docker `.env`

```bash
cd /var/www/automotive_alms

# 各种密码放这里，不进 git（PG / MinIO 各一个强密码）
cat > deploy/.env <<EOF
DB_NAME=tms
DB_USER=tms
DB_PASSWORD=在这里换成一个强密码
MINIO_ROOT_USER=tmsadmin
MINIO_ROOT_PASSWORD=在这里换成一个强密码
EOF
```

⚠️ 两个密码**必须换掉**，记下来后面 backend `.env` 要用 DB_PASSWORD。

---

### 第 4 步：起 Postgres + Redis + MinIO（全 Docker）

```bash
cd /var/www/automotive_alms

# 首次 --build 会构建 tms-timescale-postgis 镜像（约 30s）
# 之后启动秒起；--build 只需第一次或 Dockerfile 有改动时加
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker ps    # 看到 tms-postgres / tms-redis / tms-minio 都 Up

# 启用扩展（一次即可；PostgreSQL 自动持久化到 volume）
docker exec -it tms-postgres psql -U tms -d tms -c \
  "CREATE EXTENSION IF NOT EXISTS postgis; \
   CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; \
   CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

---

### 第 5 步：配 backend `.env`（生产）

```bash
cd /var/www/automotive_alms/backend
cp .env.example .env
nano .env   # 或 vim
```

**关键字段（照下面填）**：

```env
PORT=3081

# ⚠️ 从 CORS 里去掉 localhost，只留 IP:8080；未来有域名把域名加上
CORS_ORIGIN=http://8.215.32.251:8080

# ⚠️ 换成一个强随机串，可用 openssl rand -hex 32 生成
JWT_SECRET=换成一个 64 字符的随机串
JWT_EXPIRES_IN=8h

# Docker PG (bind 127.0.0.1:15432)
DB_HOST=127.0.0.1
DB_PORT=15432
DB_USERNAME=tms
DB_PASSWORD=第 3 步 deploy/.env 里的 DB_PASSWORD
DB_DATABASE=tms
DB_SYNCHRONIZE=false   # ⚠️ 生产必须 false，改 schema 走 migration

REDIS_HOST=127.0.0.1
REDIS_PORT=16379

STORAGE_DRIVER=minio
STORAGE_ENDPOINT=127.0.0.1
STORAGE_PORT=19000
STORAGE_USE_SSL=false
STORAGE_ACCESS_KEY=tmsadmin
STORAGE_SECRET_KEY=第 4 步的 MinIO 密码
STORAGE_BUCKET=tms-files
```

---

### 第 6 步：build backend + 跑 migration + 起 seed

```bash
cd /var/www/automotive_alms/backend
npm ci                        # 用 ci 严格锁版本，比 install 快且干净
npm run build                 # 生成 dist/

# 跑迁移建表
npm run migration:run

# 如果有 seed（第一次部署要建管理员账号）
npm run seed 2>/dev/null || node dist/database/seed.js
```

---

### 第 7 步：配 frontend `.env.production` + build

```bash
cd /var/www/automotive_alms/frontend
cat > .env.production <<EOF
# 走 nginx 反代（相对路径），不用带域名/IP
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_WS_URL=/
EOF

npm ci
npm run build
```

⚠️ `NEXT_PUBLIC_*` 是**编译期**注入，`.env.production` 必须在 `build` 之前配好。

---

### 第 8 步：PM2 启动

```bash
cd /var/www/automotive_alms
pm2 start deploy/ecosystem.config.js
pm2 status                   # 看到 tms-backend 和 tms-frontend 都 online
pm2 logs tms-backend --lines 30    # 快速看有没有报错

# 开机自启
pm2 save
pm2 startup systemd -u root --hp /root
# 按提示复制粘贴那条 systemctl 命令跑一下
```

---

### 第 9 步：Nginx 反代 8080

```bash
# 把仓库里的配置软链到 sites-available（改配置直接改仓库那份，重新 reload 就生效）
ln -s /var/www/automotive_alms/deploy/nginx-automotive.conf /etc/nginx/sites-available/automotive
ln -s /etc/nginx/sites-available/automotive /etc/nginx/sites-enabled/automotive

# 测试语法
nginx -t

# reload（不 restart，不影响 cargoppt 现有流量）
systemctl reload nginx
```

---

### 第 10 步：阿里云安全组开 8080

**阿里云控制台** → ECS 实例 → 安全组 → 入方向 → 添加规则：
- 协议：TCP
- 端口：`8080/8080`
- 授权对象：`0.0.0.0/0`（生产建议只放公司 IP）

---

### 第 11 步：访问验证

浏览器打开：**http://8.215.32.251:8080**

- 应该看到登录页
- 用第 6 步 seed 出来的 `admin / Admin@12345` 登录
- 登录后如果 dashboard 正常渲染 → 成功
- 如果 API 报错，看：`pm2 logs tms-backend` 和 `/var/www/automotive_alms/logs/nginx-error.log`

---

## 🔍 快速排错清单

| 症状 | 检查 |
|---|---|
| 502 Bad Gateway | `pm2 status` 看 backend/frontend 是不是挂了；`pm2 logs` 看错误 |
| 登录接口 404 | 确认 nginx `location /api/` 里的 `proxy_pass http://127.0.0.1:3081/;` 末尾**有斜杠** |
| 图片上传后拉不到 | 确认 MinIO 容器 up；检查 `.env` 里的 `STORAGE_ENDPOINT=127.0.0.1` |
| 页面 CORS 报错 | `backend/.env` 里 `CORS_ORIGIN` 是不是 `http://8.215.32.251:8080` |
| DB 连不上 | 系统 PG 是不是允许 md5 密码：`sudo -u postgres psql -c "SHOW hba_file"` 看 `pg_hba.conf` 里 `local` / `127.0.0.1` 那行是不是 `md5`/`scram-sha-256` |

---

## 🔄 后续更新流程（三行命令）

```bash
cd /var/www/automotive_alms
git pull
cd backend && npm ci && npm run build && npm run migration:run && \
cd ../frontend && npm ci && npm run build && \
pm2 restart all
```

---

## ✅ 与现有服务的隔离性验证

| 已有服务 | 端口 | 会不会被影响 |
|---|---|---|
| nginx 80/443 (cargoppt) | 80/443 | ❌ 不动，我们只加 8080 |
| PostgreSQL | 5432 | ❌ 复用实例，独立 db/user，权限隔离 |
| uvicorn (Python) | 8000 | ❌ 完全不动 |
| CargoTranslator | 独立目录 | ❌ 完全独立 |

`deploy/README.md` 已生成。

## 现在你本地就跑这一段推到 GitHub

```bash
cd /Users/ellis/Documents/automotive_alms
git add .gitignore README.md deploy/
git status                    # 确认没 .env / node_modules
git commit -m "chore: add deploy config + SOP (docker-compose.prod, pm2, nginx, README)"
git push
```

## 服务器上直接照 `deploy/README.md` 走

关键顺序**别打乱**：

```
① 拉代码  →  ② 建 PG db/user  →  ③ 起 Redis+MinIO
        →  ④ 配 backend/.env  →  ⑤ backend build + migration + seed
        →  ⑥ 配 frontend/.env.production  →  ⑦ frontend build
        →  ⑧ PM2 起  →  ⑨ Nginx 反代  →  ⑩ 云安全组 8080  →  ⑪ 访问验证
```

## 🚨 服务器上执行时**必须换的 3 个密码**

| 位置 | 生成命令 |
|---|---|
| PostgreSQL `tms` 用户密码 | `openssl rand -base64 24` |
| `backend/.env` 里的 `JWT_SECRET` | `openssl rand -hex 32` |
| `deploy/.env` 里的 `MINIO_ROOT_PASSWORD` | `openssl rand -base64 24` |

三个密码生成一次记下来，`.env` 里改完，其它 SOP 步骤按 `deploy/README.md` 走。

