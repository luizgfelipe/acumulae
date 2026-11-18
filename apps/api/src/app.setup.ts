import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/http-exception.filter';

/** Configuração compartilhada entre main.ts e os testes e2e. */
export function configureApp(app: NestExpressApplication) {
  // Atrás do proxy do Next.js e do Traefik (Dokploy).
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(cookieParser());
  // Logo do estabelecimento chega como data URL (até ~270 KB em base64).
  app.useBodyParser('json', { limit: '512kb' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
