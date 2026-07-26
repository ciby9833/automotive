import type { NextConfig } from "next";

// 支持通过 NEXT_DIST_DIR 环境变量把 build 产物输出到非默认目录。
// 部署脚本 (deploy/upgrade-frontend.sh) 用这个把新 build 先落到 .next.build，
// 再原子化合并进线上 .next，避免直接覆盖导致老 chunk 消失、老 tab 404。
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
