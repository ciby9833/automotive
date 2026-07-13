'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Form, Input, Skeleton, Tag, Typography, message } from 'antd';
import { invitationsApi, InvitationPreview } from '@/lib/api/invitations';
import { useTranslation } from '@/i18n/useTranslation';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

export default function RegisterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { t } = useTranslation();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('register.missingToken'));
      setLoading(false);
      return;
    }
    invitationsApi
      .preview(token)
      .then((p) => setPreview(p))
      .catch((err) => {
        const detail =
          (err as { response?: { data?: { message?: string } } }).response?.data
            ?.message;
        setError(detail ?? t('register.previewFailed'));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  const onFinish = async (values: {
    username: string;
    password: string;
    displayName: string;
    email?: string;
  }) => {
    setSubmitting(true);
    try {
      await invitationsApi.register({ token, ...values });
      message.success(t('register.success'));
      router.replace('/login');
    } catch (err) {
      const detail =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message;
      message.error(detail ?? t('register.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50">
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <LanguageSwitcher />
      </div>
      <Card style={{ width: 420 }}>
        <Typography.Title level={4} style={{ textAlign: 'center' }}>
          {t('register.title')}
        </Typography.Title>
        {loading ? (
          <Skeleton active />
        ) : error ? (
          <Alert type="error" message={error} />
        ) : preview ? (
          <>
            <Alert
              type="info"
              style={{ marginBottom: 16 }}
              message={
                <span>
                  {t('register.invitedAs')}{' '}
                  <strong>{preview.targetName}</strong>{' '}
                  <Tag color="blue">{t(`roles.${preview.inviteeRole}`)}</Tag>
                </span>
              }
              description={t('register.expiresAt', {
                date: new Date(preview.expiresAt).toLocaleString(),
              })}
            />
            <Form layout="vertical" onFinish={onFinish}>
              <Form.Item
                label={t('auth.username')}
                name="username"
                rules={[{ required: true, min: 3 }]}
              >
                <Input autoFocus />
              </Form.Item>
              <Form.Item
                label={t('auth.password')}
                name="password"
                rules={[{ required: true, min: 6 }]}
              >
                <Input.Password />
              </Form.Item>
              <Form.Item
                label={t('users.displayName')}
                name="displayName"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label={t('users.email')}
                name="email"
                rules={[{ type: 'email' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block loading={submitting}>
                  {t('register.submit')}
                </Button>
              </Form.Item>
            </Form>
          </>
        ) : null}
      </Card>
    </div>
  );
}
