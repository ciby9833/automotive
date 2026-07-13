import { Column, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

interface CarrierWaybillAssignedEmailProps {
  carrierName: string;
  waybillCode: string;
  transportTypeLabel: string;
  originLabel: string;
  destinationLabel: string;
  vinList: string[];
}

export function CarrierWaybillAssignedEmail({
  carrierName,
  waybillCode,
  transportTypeLabel,
  originLabel,
  destinationLabel,
  vinList,
}: CarrierWaybillAssignedEmailProps) {
  return (
    <EmailLayout
      previewText={`新运单 ${waybillCode} 已分配给贵司`}
      title="新运单分配通知"
    >
      <Text>{carrierName} 您好，</Text>
      <Text>系统为贵司分配了一张新运单，请及时在JFS系统中确认并安排运输：</Text>
      <Section
        style={{
          backgroundColor: '#f9fafb',
          borderRadius: 6,
          padding: '16px 20px',
          margin: '16px 0',
        }}
      >
        <Row>
          <Column style={{ fontSize: 13, color: '#6b7280' }}>运单号</Column>
          <Column style={{ fontSize: 13, textAlign: 'right' as const }}>
            {waybillCode}
          </Column>
        </Row>
        <Row>
          <Column style={{ fontSize: 13, color: '#6b7280' }}>运输类型</Column>
          <Column style={{ fontSize: 13, textAlign: 'right' as const }}>
            {transportTypeLabel}
          </Column>
        </Row>
        <Row>
          <Column style={{ fontSize: 13, color: '#6b7280' }}>始发</Column>
          <Column style={{ fontSize: 13, textAlign: 'right' as const }}>
            {originLabel}
          </Column>
        </Row>
        <Row>
          <Column style={{ fontSize: 13, color: '#6b7280' }}>目的</Column>
          <Column style={{ fontSize: 13, textAlign: 'right' as const }}>
            {destinationLabel}
          </Column>
        </Row>
        <Row>
          <Column style={{ fontSize: 13, color: '#6b7280' }}>
            车架号(VIN)
          </Column>
          <Column style={{ fontSize: 13, textAlign: 'right' as const }}>
            {vinList.join(', ')}
          </Column>
        </Row>
      </Section>
    </EmailLayout>
  );
}
