import { Injectable } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { config } from '../common/config';
import { randomToken, sha256 } from '../common/crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService, Tx } from '../prisma/prisma.service';

export const INVITE_TTL_HOURS = 72;

export interface InviteInput {
  tenantId: string;
  email: string;
  name?: string | null;
  role: StaffRole;
  storeIds?: string[];
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Cria um convite de uso único (RN-93). O token em claro só existe na URL devolvida. */
  async create(input: InviteInput, tx: Tx = this.prisma) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);
    const invite = await tx.staffInvite.create({
      data: {
        tenantId: input.tenantId,
        email: input.email.toLowerCase().trim(),
        name: input.name ?? null,
        role: input.role,
        storeIds: input.storeIds ?? [],
        tokenHash: sha256(token),
        expiresAt,
      },
    });
    return { invite, url: `${config.publicUrl}/painel/convite/${token}`, expiresAt };
  }

  async sendEmail(params: { email: string; tenantName: string; role: StaffRole; url: string; name?: string | null }) {
    const roleLabel = params.role === 'MANAGER' ? 'gestor(a)' : 'atendente';
    await this.mail.send({
      to: params.email,
      subject: `Convite para o painel do ${params.tenantName} no Acumulaê`,
      text:
        `Olá${params.name ? `, ${params.name}` : ''}!\n\n` +
        `Você foi convidado(a) como ${roleLabel} do programa de fidelidade do ${params.tenantName} no Acumulaê.\n\n` +
        `Para definir sua senha e acessar, use o link abaixo (válido por ${INVITE_TTL_HOURS} horas, uso único):\n` +
        `${params.url}\n\n` +
        `Se você não esperava este convite, ignore este e-mail.`,
    });
  }
}
