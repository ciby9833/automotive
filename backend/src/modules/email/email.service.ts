import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { render } from '@react-email/render';
import * as React from 'react';
import { PasswordResetEmail } from './templates/PasswordResetEmail';
import { CarrierWaybillAssignedEmail } from './templates/CarrierWaybillAssignedEmail';
import { CustomerBillEmail } from './templates/CustomerBillEmail';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

// 邮件服务：不同业务场景(找回密码/供应商通知/客户账单)各自一个 React Email 模板文件，
// 这里只负责"渲染模板 -> 通过企业SMTP服务器发送"，新增业务场景只需要加一个 send*Email 方法+对应模板
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly config: EmailConfig;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<EmailConfig>('email')!;
    this.frontendUrl = this.configService.get<string>('frontendUrl')!;

    if (this.config.host) {
      this.transporter = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.user
          ? { user: this.config.user, pass: this.config.pass }
          : undefined,
      });
    } else {
      this.logger.warn('未配置 SMTP_HOST，邮件将只打印到日志，不会真实发送');
    }
  }

  private async send(
    to: string,
    subject: string,
    element: React.ReactElement,
  ): Promise<void> {
    const html = await render(element);
    if (!this.transporter) {
      this.logger.log(`[模拟发送] to=${to} subject=${subject}`);
      return;
    }
    await this.transporter.sendMail({
      from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
      to,
      subject,
      html,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    displayName: string,
    resetToken: string,
  ): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    await this.send(
      to,
      '找回密码 - 汽车物流TMS',
      React.createElement(PasswordResetEmail, { displayName, resetUrl }),
    );
  }

  async sendCarrierWaybillAssignedEmail(
    to: string,
    params: {
      carrierName: string;
      waybillCode: string;
      transportTypeLabel: string;
      originLabel: string;
      destinationLabel: string;
      vinList: string[];
    },
  ): Promise<void> {
    await this.send(
      to,
      `新运单分配通知 - ${params.waybillCode}`,
      React.createElement(CarrierWaybillAssignedEmail, params),
    );
  }

  async sendCustomerBillEmail(
    to: string,
    params: {
      customerName: string;
      totalAmountFormatted: string;
      lines: { waybillCode: string; amountFormatted: string }[];
    },
  ): Promise<void> {
    await this.send(
      to,
      '账单对账确认 - 汽车物流TMS',
      React.createElement(CustomerBillEmail, params),
    );
  }
}
