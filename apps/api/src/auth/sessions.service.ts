import { Injectable } from '@nestjs/common';
import { randomToken, sha256 } from '../common/crypto';
import { unauthorized } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { REFRESH_TTL_DAYS } from './cookies';
import { PrincipalType, TokensService } from './tokens.service';

/** Janela em que o refresh token anterior ainda é aceito (duas abas renovando ao mesmo tempo). */
const ROTATION_GRACE_MS = 60_000;

interface SessionRow {
  id: string;
  refreshTokenHash: string;
  previousTokenHash: string | null;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  customerId?: string;
  staffUserId?: string;
  tenantId?: string | null;
  storeId?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Delegate = {
  create(args: any): Promise<SessionRow>;
  findFirst(args: any): Promise<SessionRow | null>;
  findUnique(args: any): Promise<SessionRow | null>;
  update(args: any): Promise<SessionRow>;
  updateMany(args: any): Promise<{ count: number }>;
};

export interface IssuedSession {
  sessionId: string;
  principalId: string;
  accessToken: string;
  refreshToken?: string;
}

/**
 * Sessões de longa duração (RN-10): access token JWT de 15 min + refresh token opaco,
 * rotativo, válido por 180 dias e renovado a cada uso. Só o hash do refresh vai para o banco.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  private delegate(kind: PrincipalType): Delegate {
    return (kind === 'customer' ? this.prisma.customerSession : this.prisma.staffSession) as unknown as Delegate;
  }

  private principalField(kind: PrincipalType) {
    return kind === 'customer' ? 'customerId' : 'staffUserId';
  }

  private principalOf(kind: PrincipalType, s: SessionRow): string {
    return (kind === 'customer' ? s.customerId : s.staffUserId)!;
  }

  private expiry() {
    return new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  }

  async create(kind: PrincipalType, principalId: string, deviceLabel: string | null, extra: Record<string, unknown> = {}) {
    const refreshToken = randomToken(48);
    const s = await this.delegate(kind).create({
      data: {
        [this.principalField(kind)]: principalId,
        refreshTokenHash: sha256(refreshToken),
        deviceLabel,
        expiresAt: this.expiry(),
        ...extra,
      },
    });
    const accessToken = await this.tokens.signAccess({ sub: principalId, typ: kind, sid: s.id });
    return { sessionId: s.id, principalId, accessToken, refreshToken } satisfies IssuedSession;
  }

  async refresh(kind: PrincipalType, refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw unauthorized('Sessão expirada.', 'SESSION_EXPIRED');
    const d = this.delegate(kind);
    const hash = sha256(refreshToken);
    const now = new Date();
    const s = await d.findFirst({ where: { OR: [{ refreshTokenHash: hash }, { previousTokenHash: hash }] } });
    if (!s || s.revokedAt || s.expiresAt < now) throw unauthorized('Sessão expirada.', 'SESSION_EXPIRED');

    const principalId = this.principalOf(kind, s);
    const access = () => this.tokens.signAccess({ sub: principalId, typ: kind, sid: s.id });

    if (s.previousTokenHash === hash) {
      if (s.rotatedAt && now.getTime() - s.rotatedAt.getTime() < ROTATION_GRACE_MS) {
        return { sessionId: s.id, principalId, accessToken: await access() };
      }
      // Reuso de token antigo fora da janela: possível vazamento. Encerra a sessão.
      await d.update({ where: { id: s.id }, data: { revokedAt: now } });
      throw unauthorized('Sessão expirada.', 'SESSION_EXPIRED');
    }

    const next = randomToken(48);
    const r = await d.updateMany({
      where: { id: s.id, refreshTokenHash: hash, revokedAt: null },
      data: {
        previousTokenHash: hash,
        refreshTokenHash: sha256(next),
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: this.expiry(),
      },
    });
    if (r.count === 0) {
      // Outra requisição rotacionou ao mesmo tempo: devolve só um novo access token.
      return { sessionId: s.id, principalId, accessToken: await access() };
    }
    return { sessionId: s.id, principalId, accessToken: await access(), refreshToken: next };
  }

  /** Reemite o access token de uma sessão existente (ex.: após trocar o contexto do funcionário). */
  async reissueAccess(kind: PrincipalType, sessionId: string, principalId: string) {
    return this.tokens.signAccess({ sub: principalId, typ: kind, sid: sessionId });
  }

  async findActive(kind: PrincipalType, sessionId: string): Promise<SessionRow | null> {
    const s = await this.delegate(kind).findUnique({ where: { id: sessionId } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) return null;
    return s;
  }

  async revokeByToken(kind: PrincipalType, refreshToken: string | undefined) {
    if (!refreshToken) return;
    const hash = sha256(refreshToken);
    await this.delegate(kind).updateMany({
      where: { OR: [{ refreshTokenHash: hash }, { previousTokenHash: hash }], revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeById(kind: PrincipalType, sessionId: string) {
    await this.delegate(kind).updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAll(kind: PrincipalType, principalId: string) {
    await this.delegate(kind).updateMany({
      where: { [this.principalField(kind)]: principalId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
