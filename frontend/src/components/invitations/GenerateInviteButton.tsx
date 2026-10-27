'use client';

import { useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import { CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { invitationsApi, InvitationTargetType } from '@/lib/api/invitations';
import { Role } from '@/lib/auth/role';
import { Permission, usePermission } from '@/lib/auth/permissions';
import { useTranslation } from '@/i18n/useTranslation';

// 复用组件：Carrier/Customer 详情行都能挂一个"生成邀请码"按钮
// 内部人员点击 → 后端生成 token → 前端拼成注册 URL 展示 + 一键复制
interface Props {
  targetType: InvitationTargetType;
  targetId: string;
  size?: 'small' | 'middle' | 'large';
}

const ROLE_OPTIONS_BY_TARGET: Record<InvitationTargetType, Role[]> = {
  CARRIER: [Role.CARRIER_STAFF, Role.CARRIER_DRIVER],
  CUSTOMER: [Role.CUSTOMER],
};

export function GenerateInviteButton({ targetType, targetId, size = 'small' }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const canInvite = usePermission(Permission.PARTNER_INVITE);
  if (!canInvite) return null;
  return (
    <>
      <Button size={size} icon={<LinkOutlined />} onClick={() => setOpen(true)}>
        {t('invitations.generate')}
      </Button>
      <InviteModal targetType={targetType} targetId={targetId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 只有弹窗，供「更多」菜单之类的入口打开；调用方自己判断 PARTNER_INVITE 权限 */
export function InviteModal({
  targetType,
  targetId,
  open,
  onClose,
}: {
  targetType: InvitationTargetType;
  targetId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const { t } = useTranslation();

  const onSubmit = async (values: { inviteeRole: Role; ttlDays?: number }) => {
    setSubmitting(true);
    try {
      const inv =
        targetType === 'CARRIER'
          ? await invitationsApi.createForCarrier(targetId, values)
          : await invitationsApi.createForCustomer(targetId, values);
      const base =
        typeof window !== 'undefined'
          ? `${window.location.origin}/register`
          : '/register';
      setInviteUrl(`${base}?token=${encodeURIComponent(inv.token)}`);
    } catch {
      message.error(t('invitations.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const onCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      message.success(t('invitations.copied'));
    } catch {
      message.error(t('invitations.copyFailed'));
    }
  };

  return (
    <>
      <Modal
        title={t('invitations.generateTitle')}
        open={open}
        onCancel={() => {
          onClose();
          setInviteUrl(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnHidden
      >
        {inviteUrl ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary">
              {t('invitations.shareHint')}
            </Typography.Paragraph>
            <Input.TextArea value={inviteUrl} autoSize readOnly />
            <Button icon={<CopyOutlined />} onClick={onCopy} block type="primary">
              {t('invitations.copy')}
            </Button>
          </Space>
        ) : (
          <Form form={form} layout="vertical" onFinish={onSubmit}>
            <Form.Item
              label={t('invitations.inviteeRole')}
              name="inviteeRole"
              rules={[{ required: true }]}
            >
              <Select
                options={ROLE_OPTIONS_BY_TARGET[targetType].map((r) => ({
                  value: r,
                  label: t(`roles.${r}`),
                }))}
              />
            </Form.Item>
            <Form.Item
              label={t('invitations.ttlDays')}
              name="ttlDays"
              extra={t('invitations.ttlDaysHint')}
            >
              <Input type="number" min={1} max={30} placeholder="7" />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                block
              >
                {t('invitations.generate')}
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}
