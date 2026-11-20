/**
 * Versão dos Termos de Uso e da Política de Privacidade (data da publicação, AAAA-MM-DD).
 * Ao mudar o texto de forma relevante, troque a data: quem aceitou uma versão anterior vê o aviso
 * "Atualizamos os Termos" no app e precisa aceitar de novo.
 */
export const TERMS_VERSION = '2026-11-20';

/**
 * A partir desta versão os termos dizem que o cadastro (nome, telefone, e-mail, aniversário) é
 * compartilhado com cada estabelecimento onde o cliente participa. Só quem aceitou uma versão igual
 * ou posterior entra na exportação de clientes em CSV.
 */
export const TERMS_DATA_SHARING_SINCE = '2026-11-20';

export function acceptedCurrentTerms(c: { termsAcceptedAt: Date | null; termsVersion: string | null }) {
  return !!c.termsAcceptedAt && !!c.termsVersion && c.termsVersion >= TERMS_VERSION;
}
