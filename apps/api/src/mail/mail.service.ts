import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../common/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * E-mail transacional via SMTP (dev: Mailpit). Sem SMTP_HOST, só registra no log.
 * Falhas de envio não derrubam a requisição: são registradas no log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter: Transporter | null = null;
  /** Usado pelos testes para inspecionar e-mails enviados. */
  readonly sent: MailMessage[] = [];

  private getTransporter(): Transporter | null {
    if (!config.smtp.host) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      });
    }
    return this.transporter;
  }

  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
    if (this.sent.length > 100) this.sent.shift();
    const t = this.getTransporter();
    if (!t) {
      this.logger.log(`(sem SMTP) Para: ${msg.to} | ${msg.subject}\n${msg.text}`);
      return;
    }
    try {
      await t.sendMail({ from: config.smtp.from, ...msg, html: msg.html ?? toHtml(msg.text) });
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail para ${msg.to}: ${(err as Error).message}`);
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function toHtml(text: string) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#222">${body}</div>`;
}
