import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

// 所有邮件模板共用的外壳(品牌头/尾)，各业务场景模板只需要写中间内容，
// 保证不同类型邮件(找回密码/供应商通知/客户账单)视觉风格统一
interface EmailLayoutProps {
  previewText: string;
  title: string;
  children: React.ReactNode;
}

export function EmailLayout({
  previewText,
  title,
  children,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f6f8',
          fontFamily: 'Arial, sans-serif',
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 8,
            maxWidth: 480,
            margin: '0 auto',
            padding: '32px',
          }}
        >
          <Section style={{ textAlign: 'center', marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#1f4e78',
                margin: 0,
              }}
            >
              汽车物流TMS
            </Text>
          </Section>
          <Heading style={{ fontSize: 18, color: '#111827' }}>{title}</Heading>
          {children}
          <Hr style={{ margin: '32px 0 16px', borderColor: '#e5e7eb' }} />
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>
            此邮件由系统自动发送，请勿直接回复。
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
