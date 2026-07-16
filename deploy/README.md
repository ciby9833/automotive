# TMS 部署 SOP

生产部署指南 · 面向 Linux 服务器 (Ubuntu/Debian，其他发行版命令类同)。
适用场景：**服务器已跑其他服务，本项目与其隔离共存**。

---

## 部署策略

### 端口 & 服务分配

| 组件 | 端口 | 策略 |
|---|---|---|
| **系统 PostgreSQL** | 5432 | **复用**，建独立 db `tms` + 独立 user `tms` |
| **Redis (docker)** | 16379 | docker 起，只 bind 127.0.0.1 |
| **MinIO (docker)** | 19000 / 19001 | docker 起，只 bind 127.0.0.1 |
| **Backend (Node)** | 3081 | PM2 起，只 bind 127.0.0.1 |
| **Frontend (Node)** | 3080 | PM2 起，只 bind 127.0.0.1 |
| **Nginx 反代** | 8080 | 新加 site，暴露给公网 |

**访问入口**：`http://<服务器 IP>:8080`（未来加域名时改 nginx `server_name` + 加 SSL）。

### 与已有服务的隔离性

- Nginx 80/443 老站点不动，只新增 8080 server block
- 系统 PG 已有 database 不动，权限完全隔离（tms user 只能访问 tms db）
- Redis/MinIO 全部走 docker + 127.0.0.1 绑定，不对外暴露

---

## 前置条件

服务器安装：
- Node 20+
- Docker + Docker Compose
- PM2 (`npm i -g pm2`)
- 系统 PostgreSQL 12+ (含 postgis 扩展)
- Nginx

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

### 2. 系统 PostgreSQL 建独立 db + user

```bash
sudo -u postgres psql <<'EOF'
CREATE USER tms WITH PASSWORD '换成强密码';
CREATE DATABASE tms OWNER tms ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE tms TO tms;
\c tms
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO tms;
EOF
```

### 3. 起 Redis + MinIO

```bash
cd /var/www/automotive_alms

# 建 docker-compose 用的 env 文件（MinIO 密码放这里，不进 git）
cat > deploy/.env <<'EOF'
MINIO_ROOT_USER=tmsadmin
MINIO_ROOT_PASSWORD=换成强密码
EOF

docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d
docker ps    # 确认 tms-redis / tms-minio 都 Up
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

# 复用系统 PG (5432)
DB_HOST=127.0.0.1
DB_PORT=5432
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
node dist/database/seed.js    # 建默认管理员账号 admin/Admin@12345
```

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

cd backend && npm ci && npm run build && npm run migration:run
cd ../frontend && npm ci && npm run build
pm2 restart all
```

---

## 常见问题

| 症状 | 排查方法 |
|---|---|
| 502 Bad Gateway | `pm2 status` / `pm2 logs tms-backend` |
| API 404 | 确认 nginx `location /api/` 的 `proxy_pass` **末尾有斜杠** |
| 图片上传后 404 | `docker ps` 看 tms-minio Up；检查 `.env` 的 `STORAGE_ENDPOINT` |
| CORS 拒绝 | `backend/.env` 的 `CORS_ORIGIN` 是否包含实际访问入口 |
| DB 连不上 | 系统 PG 的 `pg_hba.conf` 里 `127.0.0.1` 那行 auth 方式 |
| 迁移失败 | 检查 postgis / uuid-ossp 扩展是否已装到 tms 库 |

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
| **系统 PostgreSQL** | 5432 | 已在 | **复用**，建独立 db `tms` + 独立 user `tms` |
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

### 第 3 步：系统 PostgreSQL 建独立 db + user

```bash
# 现有 PG 在 127.0.0.1:5432，我们建独立 db 和 user，不动它任何已存在数据
sudo -u postgres psql <<EOF
CREATE USER tms WITH PASSWORD '在这里换成一个强密码';
CREATE DATABASE tms OWNER tms ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE tms TO tms;
\c tms
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO tms;
EOF
```

⚠️ 密码**必须换掉**，记下来下一步 .env 要用。

---

### 第 4 步：起 Redis + MinIO（只这俩，PG 不动）

```bash
cd /var/www/automotive_alms

# 建 docker-compose 用的环境变量文件（MinIO 密码放这里）
cat > deploy/.env <<EOF
MINIO_ROOT_USER=tmsadmin
MINIO_ROOT_PASSWORD=在这里换成一个强密码
EOF

# 起容器
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d
docker ps    # 看到 tms-redis 和 tms-minio 都 Up
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

# 复用系统 PG (5432)，用第 3 步建的 tms 库和用户
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USERNAME=tms
DB_PASSWORD=第 3 步的强密码
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

