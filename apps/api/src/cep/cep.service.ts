import { Injectable, Logger } from '@nestjs/common';
import { AppError, badRequest, notFound } from '../common/errors';
import { UFS } from '../common/address';

export interface CepResult {
  cep: string;
  /** Vazio em CEP geral de cidade pequena: o gestor digita a rua. */
  street: string;
  district: string;
  city: string;
  state: (typeof UFS)[number];
}

/** null = o serviço respondeu que o CEP não existe; throw = serviço fora do ar. */
type Provider = { name: string; lookup: (cep: string) => Promise<CepResult | null> };

const TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 5_000;

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  const body = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  return { status: res.status, body };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function result(cep: string, street: unknown, district: unknown, city: unknown, state: unknown): CepResult | null {
  const uf = str(state).toUpperCase();
  if (!str(city) || !(UFS as readonly string[]).includes(uf)) return null;
  return { cep, street: str(street), district: str(district), city: str(city), state: uf as CepResult['state'] };
}

/** BrasilAPI: consulta os Correios e outras bases. */
const brasilApi: Provider = {
  name: 'brasilapi',
  async lookup(cep) {
    const { status, body } = await getJson(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (status === 404 || status === 400) return null;
    if (!body) throw new Error(`HTTP ${status}`);
    return result(cep, body.street, body.neighborhood, body.city, body.state);
  },
};

const viaCep: Provider = {
  name: 'viacep',
  async lookup(cep) {
    const { status, body } = await getJson(`https://viacep.com.br/ws/${cep}/json/`);
    if (status === 400 || body?.erro) return null;
    if (!body) throw new Error(`HTTP ${status}`);
    return result(cep, body.logradouro, body.bairro, body.localidade, body.uf);
  },
};

/**
 * Busca de endereço pelo CEP. A API oficial dos Correios exige contrato, então usamos a BrasilAPI
 * (que consulta os Correios) e o ViaCEP de reserva. Resultados ficam em cache por 7 dias.
 */
@Injectable()
export class CepService {
  private readonly log = new Logger(CepService.name);
  private readonly cache = new Map<string, { at: number; value: CepResult | null }>();
  providers: Provider[] = [brasilApi, viaCep];

  async lookup(raw: string): Promise<CepResult> {
    const cep = raw.replace(/\D/g, '');
    if (cep.length !== 8) throw badRequest('CEP_INVALID', 'CEP deve ter 8 dígitos.');

    const cached = this.cache.get(cep);
    let value: CepResult | null | undefined = cached && Date.now() - cached.at < CACHE_TTL_MS ? cached.value : undefined;

    if (value === undefined) {
      let answered = false;
      for (const p of this.providers) {
        try {
          value = await p.lookup(cep);
          answered = true;
          if (value) break;
        } catch (e) {
          this.log.warn(`CEP ${cep}: ${p.name} falhou (${(e as Error).message})`);
        }
      }
      if (!answered) throw new AppError(503, 'CEP_UNAVAILABLE', 'Não conseguimos consultar o CEP agora. Preencha o endereço manualmente.');
      this.remember(cep, value ?? null);
    }

    if (!value) throw notFound('CEP não encontrado. Confira o número ou preencha o endereço manualmente.', 'CEP_NOT_FOUND');
    return value;
  }

  private remember(cep: string, value: CepResult | null) {
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(cep, { at: Date.now(), value });
  }

  clearCache() {
    this.cache.clear();
  }
}
