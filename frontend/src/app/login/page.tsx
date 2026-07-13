'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Form, Input, Modal, Typography, message } from 'antd';
import { forgotPassword, login } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPreAuth = useAuthStore((s) => s.setPreAuth);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotForm] = Form.useForm();
  const { t } = useTranslation();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      if (res.mode === 'NEEDS_SELECTION') {
        // 多 membership：拿预授权 token 去选择页；后续 setAuth 由 select-org 页处理
        setPreAuth({
          token: res.accessToken,
          user: res.user,
          memberships: res.memberships ?? [],
          permissions: res.permissions ?? [],
        });
        router.replace('/select-org');
        return;
      }
      setAuth({
        token: res.accessToken,
        user: res.user,
        mode: res.mode,
        activeOrgId: res.activeOrgId ?? null,
        memberships: res.memberships ?? [],
        externalContext: res.externalContext ?? null,
        permissions: res.permissions ?? [],
      });
      router.replace('/dashboard');
    } catch {
      message.error(t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async (values: { email: string }) => {
    setForgotLoading(true);
    try {
      await forgotPassword(values.email);
      message.success(t('auth.forgotPasswordSent'));
      setForgotOpen(false);
      forgotForm.resetFields();
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50">
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <LanguageSwitcher />
      </div>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          {t('auth.title')}
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            label={t('auth.username')}
            name="username"
            rules={[{ required: true, message: t('auth.usernameRequired') }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            label={t('auth.password')}
            name="password"
            rules={[{ required: true, message: t('auth.passwordRequired') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('auth.login')}
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Typography.Link onClick={() => setForgotOpen(true)}>
            {t('auth.forgotPassword')}
          </Typography.Link>
        </div>
      </Card>

      <Modal
        title={t('auth.forgotPasswordTitle')}
        open={forgotOpen}
        onCancel={() => setForgotOpen(false)}
        onOk={() => forgotForm.submit()}
        confirmLoading={forgotLoading}
        destroyOnHidden
      >
        <Form form={forgotForm} layout="vertical" onFinish={onForgotPassword}>
          <Form.Item
            label={t('auth.email')}
            name="email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
