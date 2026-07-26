#!/usr/bin/env bash
#
# 前端安全升级脚本：解决 Next.js chunk hash 失配导致的部署过渡期 404
#
# 问题
#   Next.js build 产物是内容 hash 命名（如 27t6pnqr5na4o.js）。直接
#   `npm run build && pm2 restart` 会用新 .next 覆盖老 .next，老 hash 文件消失。
#   已经打开着页面的用户 tab 引用的是**老 hash chunk**，操作时 lazy-load 会 404。
#
# 策略
#   1. build 到临时目录 .next.build（不动线上 .next）
#   2. 把新 static/* 合入现有 .next/static（保留老 hash 文件！）
#   3. 其他产物（server/BUILD_ID/…）覆盖式换新
#   4. pm2 reload（graceful）
#   5. 30 天前的老 static 文件由 cron 或人工清理
#
# 前置要求
#   next.config.ts 支持 NEXT_DIST_DIR env 覆盖 distDir（见配套改动）
#
# 用法
#   bash deploy/upgrade-frontend.sh
#
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/automotive_alms}"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BUILD_STAGING="$FRONTEND_DIR/.next.build"
LIVE="$FRONTEND_DIR/.next"

cd "$FRONTEND_DIR"

echo "[upgrade-frontend] 1/5 · npm ci"
npm ci --no-audit --no-fund

echo "[upgrade-frontend] 2/5 · build → $BUILD_STAGING (不动线上 .next)"
rm -rf "$BUILD_STAGING"
NEXT_DIST_DIR="$BUILD_STAGING" npx next build

if [ ! -d "$BUILD_STAGING" ]; then
  echo "[upgrade-frontend] ✗ build 产物未在 $BUILD_STAGING 生成，请确认 next.config 读取 NEXT_DIST_DIR"
  exit 1
fi

echo "[upgrade-frontend] 3/5 · 合并 static (保留老 chunks 让老 tab 请求命中)"
mkdir -p "$LIVE/static"
# --ignore-existing：目标已存在的老 hash 文件不动，新增的补进去
rsync -a --ignore-existing "$BUILD_STAGING/static/" "$LIVE/static/"
# 老文件 mtime 保留，方便 30 天后清理

echo "[upgrade-frontend] 4/5 · 切换 server/manifests (原子化)"
for item in server BUILD_ID build-manifest.json prerender-manifest.json \
            routes-manifest.json required-server-files.json \
            app-build-manifest.json react-loadable-manifest.json \
            images-manifest.json app-path-routes-manifest.json \
            functions-config-manifest.json trace; do
  if [ -e "$BUILD_STAGING/$item" ]; then
    rm -rf "$LIVE/$item"
    mv "$BUILD_STAGING/$item" "$LIVE/$item"
  fi
done

# 剩余临时目录
rm -rf "$BUILD_STAGING"

echo "[upgrade-frontend] 5/5 · pm2 reload tms-frontend (graceful)"
pm2 reload tms-frontend

STALE=$(find "$LIVE/static" -type f -mtime +30 2>/dev/null | wc -l | tr -d ' ')
echo "[upgrade-frontend] ✓ 完成"
echo "  $LIVE/static 里有 $STALE 个 >30 天的老文件"
echo "  清理命令：find $LIVE/static -type f -mtime +30 -delete"
