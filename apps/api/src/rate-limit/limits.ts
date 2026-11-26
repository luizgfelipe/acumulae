import { RouteLimit } from './rate-limit.decorator';

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Limites por IP das rotas públicas além do login (os do login e do "esqueci minha senha" ficam no
 * LoginRateLimiter). Folgados de propósito: vários clientes podem dividir o IP do Wi-Fi do estabelecimento.
 */
export const LIMITS = {
  /** Cadastro: 130 por IP em 1 h (criação de contas em massa). Cabe o lançamento de um estabelecimento, com todos no mesmo Wi-Fi. */
  registerAll: { rule: { name: 'register:all', windowMs: HOUR, max: 130, blockMs: HOUR, maxBlockMs: 24 * HOUR }, countOn: 'all' },
  /** Cadastro recusado (conta já existe, senha fraca…): 20 por IP em 1 h. Freia quem testa telefones e e-mails. */
  registerFailure: {
    rule: { name: 'register:fail', windowMs: HOUR, max: 20, blockMs: HOUR, maxBlockMs: 24 * HOUR },
    countOn: 'failure',
  },
  /**
   * Links e QRs com token (convite, redefinição de senha, QR temporário do caixa): 20 recusas por IP em 15 min,
   * somando as rotas. Os tokens são longos demais para adivinhar; o limite corta a tentativa logo no começo
   * e, no convite de quem já tem conta, a adivinhação da senha atual.
   */
  tokenFailure: {
    rule: { name: 'token:fail', windowMs: 15 * MIN, max: 20, blockMs: 15 * MIN, maxBlockMs: 24 * HOUR },
    countOn: 'failure',
  },
} satisfies Record<string, RouteLimit>;
