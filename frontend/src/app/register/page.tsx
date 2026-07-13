import { Suspense } from 'react';
import RegisterInner from './RegisterInner';

// 外部人员凭邀请码注册页；从 URL 里读 ?token=xxx；用 Suspense 包 useSearchParams 避免 CSR bail-out
export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
