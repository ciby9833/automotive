import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

interface PasswordResetEmailProps {
  displayName: string;
  resetUrl: string;
}

export function PasswordResetEmail({
  displayName,
  resetUrl,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout previewText="重置您的汽车物流TMS登录密码" title="找回密码">
      <Text>{displayName} 您好，</Text>
      <Text>
        我们收到了您的密码重置请求，请点击下方按钮设置新密码（链接1小时内有效）：
      </Text>
      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button
          href={resetUrl}
          style={{
            backgroundColor: '#1f4e78',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          重置密码
        </Button>
      </Section>
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        如果这不是您本人的操作，请忽略此邮件，您的账号仍然安全。
      </Text>
    </EmailLayout>
  );
}
