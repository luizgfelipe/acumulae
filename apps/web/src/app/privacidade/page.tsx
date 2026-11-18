import Link from 'next/link';

export const metadata = { title: 'Política de Privacidade' };

// Texto-base para o MVP (LGPD, seção 10 da especificação). Revisar com assessoria jurídica.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-5 py-8 leading-relaxed text-stone-700">
      <Link href="/" className="text-sm font-semibold text-brand-700">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-stone-900">Política de Privacidade</h1>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Dados que coletamos</h2>
      <p>Nome, telefone (WhatsApp), e-mail, senha (guardada de forma criptografada) e, se você quiser, data de nascimento. Não coletamos CPF.</p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">O que cada estabelecimento vê</h2>
      <p>
        Cada estabelecimento onde você consome passa a ver seu nome e o histórico de consumo <strong>naquele estabelecimento</strong>. Ele
        nunca vê sua relação com outros estabelecimentos. Telefone, e-mail e data de nascimento só ficam visíveis para quem você autorizar
        a enviar promoções.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Consentimento de marketing</h2>
      <p>
        O consentimento é separado do cadastro e vale por estabelecimento. Aceitar promoções de um não autoriza os outros. Você pode
        revogar quando quiser, em Conta.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Exclusão</h2>
      <p>
        Ao excluir a conta, seus dados pessoais são anonimizados. As movimentações permanecem para a auditoria dos estabelecimentos, mas
        sem identificar você.
      </p>
    </article>
  );
}
