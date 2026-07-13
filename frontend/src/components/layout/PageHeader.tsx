'use client';

import type { ReactNode } from 'react';

// 统一的页面标题组件。业务页面用它替代散落的 <h2>+按钮，视觉一致
// 用法：
//   <PageHeader
//     title={t('inbound.orders.title')}
//     subtitle="..."
//     toolbar={<Space>...</Space>}
//     actions={<Button>导入 Excel</Button>}
//   />
export function PageHeader({
  title,
  subtitle,
  toolbar,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode; // 左侧过滤/搜索工具栏
  actions?: ReactNode; // 右侧主操作按钮
}) {
  return (
    <div className="page-header">
      <div className="page-header-left">
        <h2 className="page-header-title">{title}</h2>
        {subtitle && <div className="page-header-subtitle">{subtitle}</div>}
        {toolbar && <div style={{ marginTop: 8 }}>{toolbar}</div>}
      </div>
      {actions && <div className="page-header-toolbar">{actions}</div>}
    </div>
  );
}
