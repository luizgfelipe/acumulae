/** Leitura centralizada das variáveis de ambiente. */
function required(name: string, fallbackForDev: string): string {
  const v = process.env[name]?.trim();
  if (v) {
    if (process.env.NODE_ENV === 'production' && v.startsWith('troque-')) {
      console.warn(`[config] ${name} ainda está com o valor de exemplo. Troque em produção!`);
    }
    return v;
  }
  if (process.env.NODE_ENV !== 'production') return fallbackForDev;
  throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
}

export const config = {
  get publicUrl() {
    return (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  },
  get jwtSecret() {
    return required('JWT_SECRET', 'dev-jwt-secret');
  },
  get qrSecret() {
    return required('QR_SECRET', 'dev-qr-secret');
  },
  get platformApiKey() {
    return process.env.PLATFORM_API_KEY?.trim() ?? '';
  },
  get platformAllowedIps(): string[] {
    return (process.env.PLATFORM_ALLOWED_IPS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get cookieSecure() {
    return process.env.COOKIE_SECURE === 'true';
  },
  /**
   * Quantos proxies confiáveis repassam o X-Forwarded-For. Padrão 1: o Traefik do Dokploy acrescenta o IP
   * real ao final e o Next.js repassa o cabeçalho sem mexer, então vale a última entrada.
   * Se puser o Cloudflare (proxy laranja) na frente, use 2.
   */
  get trustProxyHops() {
    const n = Number(process.env.TRUST_PROXY_HOPS ?? 1);
    return Number.isInteger(n) && n >= 0 ? n : 1;
  },
  smtp: {
    get host() {
      return process.env.SMTP_HOST ?? '';
    },
    get port() {
      return Number(process.env.SMTP_PORT ?? 587);
    },
    get secure() {
      return process.env.SMTP_SECURE === 'true';
    },
    get user() {
      return process.env.SMTP_USER ?? '';
    },
    get pass() {
      return process.env.SMTP_PASS ?? '';
    },
    get from() {
      return process.env.MAIL_FROM ?? 'Acumulaê <nao-responda@acumulae.com.br>';
    },
  },
  /** Notificações no celular (Web Push). Gere o par com: npx web-push generate-vapid-keys */
  push: {
    get publicKey() {
      return process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
    },
    get privateKey() {
      return process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
    },
    /** Contato do remetente exigido pelos serviços de push (mailto: ou https://). */
    get subject() {
      return process.env.VAPID_SUBJECT?.trim() || "mailto:suporte@acumulae.com.br";
    },
    get enabled() {
      return !!(this.publicKey && this.privateKey);
    },
  },
  google: {
    get clientId() {
      return process.env.GOOGLE_CLIENT_ID ?? '';
    },
    get clientSecret() {
      return process.env.GOOGLE_CLIENT_SECRET ?? '';
    },
    get enabled() {
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
  },
  apple: {
    get enabled() {
      return process.env.APPLE_ENABLED === 'true' && !!process.env.APPLE_CLIENT_ID;
    },
    get clientId() {
      return process.env.APPLE_CLIENT_ID ?? '';
    },
    get teamId() {
      return process.env.APPLE_TEAM_ID ?? '';
    },
    get keyId() {
      return process.env.APPLE_KEY_ID ?? '';
    },
    get privateKey() {
      return (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
    },
  },
};
