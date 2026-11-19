import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { config } from './common/config';

/** Configuração compartilhada entre main.ts e os testes e2e. */
export function configureApp(app: NestExpressApplication) {
  // Atrás do Traefik (Dokploy) e do proxy do Next.js. Confiar em "qualquer proxy" (true) deixaria o cliente
  // forjar o próprio IP pelo X-Forwarded-For e driblar o limite de login e o PLATFORM_ALLOWED_IPS.
  app.set('trust proxy', config.trustProxyHops);
  app.disable('x-powered-by');
  // A API só devolve JSON e imagens: CSP fechada. As páginas recebem os cabeçalhos pelo next.config.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      frameguard: { action: 'deny' },
      hsts: config.cookieSecure ? { maxAge: 63072000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  // Logo do estabelecimento chega como data URL (até ~270 KB em base64).
  app.useBodyParser('json', { limit: '512kb' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
