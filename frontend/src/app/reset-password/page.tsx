'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { resetPassword } from '@/lib/api/auth';
import { useTranslation } from '@/i18n/useTranslation';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const onFinish = async (values: { newPassword: string }) => {
    if (!token) return;
    setLoading(true);
    try {
      await resetPassword(token, values.newPassword);
      message.success(t('auth.resetPasswordSuccess'));
      router.replace('/login');
    } catch {
      message.error(t('auth.resetPasswordFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ width: 380 }}>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>
        {t('auth.resetPasswordTitle')}
      </Typography.Title>
      {!token ? (
        <Alert type="warning" message={t('auth.tokenMissing')} />
      ) : (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            label={t('auth.newPassword')}
            name="newPassword"
            rules={[{ required: true, min: 6 }]}
          >
            <Input.Password autoFocus />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('auth.resetPasswordSubmit')}
            </Button>
          </Form.Item>
        </Form>
      )}
      <div style={{ textAlign: 'center' }}>
        <Typography.Link href="/login">{t('auth.backToLogin')}</Typography.Link>
      </div>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50">
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <LanguageSwitcher />
      </div>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
