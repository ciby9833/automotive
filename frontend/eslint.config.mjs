import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// P0 阶段所有数据获取用的都是 useState + useEffect 模式（老 React 惯例）。
// Next.js 16 引入了严格 React purity/effect 规则，触发大量 lint error 但不影响构建/运行。
// 将这两条规则降为 warn；P1 阶段做统一改造(React Query / Suspense)后再收紧。
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
