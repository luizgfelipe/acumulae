import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import webpush from 'web-push';
import { z } from 'zod';
import { logoUrlOf } from '../common/branding';
import { config } from '../common/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Serviços de push dos navegadores. A API só envia para estes endereços: a URL vem do aparelho do
 * cliente e, sem a lista, daria para usar o envio para chamar endereços internos (SSRF).
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge Android, Samsung Internet, Opera, Brave
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari e app instalado no iPhone (web.push.apple.com)
  'notify.windows.com', // Edge no Windows (wns2-*.notify.windows.com)
];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const base64url = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/);

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, 'Serviço de notificações não suportado.'),
  keys: z.object({ p256dh: base64url(200), auth: base64url(100) }),
});

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(1000) });

/** Aparelhos por cliente; o que estiver há mais tempo sem abrir o app sai primeiro. */
const MAX_DEVICES = 10;
/** Notificações por rodada do envio. */
const BATCH = 200;
/** Envios simultâneos para os serviços de push. */
const CONCURRENCY = 10;
/** Notificação mais antiga que isso não vai mais para o celular (só fica no sino). */
const MAX_AGE_MINUTES = 15;
const TICK_MS = 3_000;

export interface PushPayload {
  id: string;
  title: string;
  body: string;
  /** Tela que abre ao tocar. */
  url: string;
  icon: string;
}

interface Target {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

type Sender = (target: Target, payload: string, options: webpush.RequestOptions) => Promise<unknown>;

/**
 * Notificações no celular (Web Push). Cada notificação do sino é enviada uma vez para os aparelhos
 * do cliente que ativaram o push. O envio roda fora da transação da movimentação: uma rodada a cada
 * poucos segundos pega as notificações ainda não enviadas (FOR UPDATE SKIP LOCKED deixa várias
 * instâncias da API rodarem juntas sem enviar duas vezes).
 */
@Injectable()
export class PushService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private timer?: NodeJS.Timeout;
  private running = false;
  /** Trocado nos testes. */
  sender: Sender = (target, payload, options) => webpush.sendNotification(target, payload, options);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!config.push.enabled) {
      this.logger.log('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes: notificações só no app (sem push no celular).');
      return;
    }
    if (process.env.NODE_ENV === 'test') return; // os testes chamam dispatch() direto
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  publicConfig() {
    return { publicKey: config.push.enabled ? config.push.publicKey : null };
  }

  async subscribe(customerId: string, input: z.infer<typeof pushSubscriptionSchema>, userAgent?: string) {
    const data = {
      customerId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
      lastSeenAt: new Date(),
    };
    // O endpoint é do navegador: se outra pessoa usava o mesmo aparelho, ele passa para quem está logado agora.
    // Primeiro aparelho: as notificações ainda pendentes ficam só no sino (quem ativa agora não recebe as antigas).
    if (!(await this.prisma.pushSubscription.count({ where: { customerId } }))) {
      await this.prisma.notification.updateMany({ where: { customerId, pushedAt: null }, data: { pushedAt: new Date() } });
    }
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
    if (existing && existing.customerId === customerId) {
      await this.prisma.pushSubscription.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: input.endpoint } });
      await this.prisma.pushSubscription.create({ data: { ...data, endpoint: input.endpoint } });
    }
    const extra = await this.prisma.pushSubscription.findMany({
      where: { customerId },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (extra.length) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    return { enabled: true };
  }

  async unsubscribe(customerId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { customerId, endpoint } });
    return { enabled: false };
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      while ((await this.dispatch()) === BATCH) {
        /* ainda tem fila (ex.: aviso para muitos clientes) */
      }
    } catch (err) {
      this.logger.error(`Falha no envio de push: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Uma rodada: marca como enviadas as notificações pendentes de clientes com push ativo e envia.
   * Devolve quantas notificações foram pegas.
   */
  async dispatch(): Promise<number> {
    if (!config.push.enabled) return 0;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; customer_id: string; tenant_id: string | null; membership_id: string | null; title: string; body: string }>
    >`
      UPDATE notifications n SET pushed_at = now()
      WHERE n.id IN (
        SELECT p.id FROM notifications p
        WHERE p.pushed_at IS NULL
          AND p.created_at > now() - make_interval(mins => ${MAX_AGE_MINUTES}::int)
          AND p.read_at IS NULL
          AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.customer_id = p.customer_id)
        ORDER BY p.created_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING n.id, n.customer_id, n.tenant_id, n.membership_id, n.title, n.body`;
    if (!rows.length) return 0;

    const [subs, tenants] = await Promise.all([
      this.prisma.pushSubscription.findMany({ where: { customerId: { in: [...new Set(rows.map((r) => r.customer_id))] } } }),
      this.prisma.tenant.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.tenant_id).filter((t): t is string => !!t))] } },
        select: { id: true, slug: true, branding: { select: { logoMime: true, version: true } } },
      }),
    ]);
    const icons = new Map(tenants.map((t) => [t.id, logoUrlOf(t.slug, t.branding)]));

    const jobs: Array<{ sub: (typeof subs)[number]; payload: PushPayload }> = [];
    for (const r of rows) {
      const payload: PushPayload = {
        id: r.id,
        title: r.title,
        body: r.body,
        url: r.membership_id ? `/cartao/${r.membership_id}` : '/notificacoes',
        icon: (r.tenant_id && icons.get(r.tenant_id)) || '/icons/192',
      };
      for (const sub of subs) if (sub.customerId === r.customer_id) jobs.push({ sub, payload });
    }

    const gone = new Set<string>();
    const options: webpush.RequestOptions = {
      vapidDetails: { subject: config.push.subject, publicKey: config.push.publicKey, privateKey: config.push.privateKey },
      TTL: 24 * 60 * 60,
      urgency: 'normal',
    };
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const { sub, payload } = jobs[next++];
        if (gone.has(sub.id)) continue;
        try {
          await this.sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), options);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: o cliente desativou nas configurações ou desinstalou. Não adianta tentar de novo.
          if (status === 404 || status === 410) gone.add(sub.id);
          else this.logger.warn(`Push recusado (${status ?? 'sem status'}) para ${new URL(sub.endpoint).host}: ${(err as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
    if (gone.size) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: [...gone] } } });
    return rows.length;
  }
}
