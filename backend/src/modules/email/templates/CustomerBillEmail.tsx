import { Column, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

interface BillLine {
  waybillCode: string;
  amountFormatted: string;
}

interface CustomerBillEmailProps {
  customerName: string;
  totalAmountFormatted: string;
  lines: BillLine[];
}

export function CustomerBillEmail({
  customerName,
  totalAmountFormatted,
  lines,
}: CustomerBillEmailProps) {
  return (
    <EmailLayout
      previewText={`账单确认：共 ${lines.length} 张运单待确认`}
      title="账单对账确认"
    >
      <Text>{customerName} 您好，</Text>
      <Text>以下运单费用已生成账单，请核对并在系统内确认对账：</Text>
      <Section
        style={{
          backgroundColor: '#f9fafb',
          borderRadius: 6,
          padding: '16px 20px',
          margin: '16px 0',
        }}
      >
        {lines.map((line) => (
          <Row key={line.waybillCode} style={{ padding: '4px 0' }}>
            <Column style={{ fontSize: 13, color: '#374151' }}>
              {line.waybillCode}
            </Column>
            <Column style={{ fontSize: 13, textAlign: 'right' as const }}>
              {line.amountFormatted}
            </Column>
          </Row>
        ))}
        <Row
          style={{
            borderTop: '1px solid #e5e7eb',
            marginTop: 8,
            paddingTop: 8,
          }}
        >
          <Column style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            合计
          </Column>
          <Column
            style={{
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'right' as const,
            }}
          >
            {totalAmountFormatted}
          </Column>
        </Row>
      </Section>
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        如对账单有疑问，请联系您的业务对接人。
      </Text>
    </EmailLayout>
  );
}
