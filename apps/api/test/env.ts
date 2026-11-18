// Variáveis de ambiente dos testes de integração.
// Usa o banco `acumulae_test` criado pelo docker compose de desenvolvimento.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://acumulae:acumulae@localhost:5432/acumulae_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.PLATFORM_API_KEY = 'test-platform-key';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.QR_SECRET = 'test-qr-secret';
process.env.PUBLIC_URL = 'http://localhost:3000';
process.env.SMTP_HOST = '';
process.env.COOKIE_SECURE = 'false';
