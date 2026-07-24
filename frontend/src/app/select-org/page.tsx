'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, List, Tag, Typography, message } from 'antd';
import { selectOrg } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

// 多 membership 场景专用：登录后前端拿到预授权 token，用户在这里挑一个 org 才能进入业务页
// 页面级守卫：如果没有预授权 token 或已经是完整授权，直接跳走；不允许通过手输 URL 停留在这
export default function SelectOrgPage() {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);
  const mode = useAuthStore((s) => s.mode);
  const memberships = useAuthStore((s) => s.memberships);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) {
      router.replace('/login');
    } else if (mode !== 'NEEDS_SELECTION') {
      // 已经是完整授权（外部/单机构），机构已定，去 dashboard
      router.replace('/dashboard');
    }
  }, [hasHydrated, token, mode, router]);

  const onPick = async (orgId: string) => {
    setSubmitting(orgId);
    try {
      const res = await selectOrg(orgId);
      setAuth({
        token: res.accessToken,
        user: res.user,
        mode: res.mode,
        activeOrgId: res.activeOrgId ?? null,
        memberships: res.memberships ?? [],
        externalContext: res.externalContext ?? null,
        accountUnit: res.accountUnit ?? null,
        permissions: res.permissions ?? [],
      });
      // 记住上次选择，下次同一账号登录时可以做默认高亮
      if (typeof window !== 'undefined' && res.user?.id) {
        localStorage.setItem(`tms-last-org-${res.user.id}`, orgId);
      }
      router.replace('/dashboard');
    } catch {
      message.error(t('auth.selectOrgFailed'));
    } finally {
      setSubmitting(null);
    }
  };

  if (!hasHydrated) return null;

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50">
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <LanguageSwitcher />
      </div>
      <Card style={{ width: 420 }}>
        <Typography.Title level={4} style={{ textAlign: 'center' }}>
          {t('auth.selectOrgTitle')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          {t('auth.selectOrgHint')}
        </Typography.Paragraph>
        <List
          dataSource={memberships}
          renderItem={(m) => (
            <List.Item
              actions={[
                <Button
                  key="pick"
                  type="primary"
                  loading={submitting === m.organizationId}
                  onClick={() => onPick(m.organizationId)}
                >
                  {t('auth.selectOrgEnter')}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={localizedOrganizationName(
                  m.organizationCode,
                  m.organizationName,
                  locale,
                )}
                description={
                  <Tag color={m.role === 'HQ_ADMIN' ? 'gold' : 'blue'}>
                    {t(`roles.${m.role}`)}
                  </Tag>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
