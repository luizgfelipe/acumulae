import Link from 'next/link';

export const metadata = { title: 'Política de Privacidade' };

// Texto-base para o MVP (LGPD, seção 10 da especificação). Revisar com assessoria jurídica.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-5 py-8 leading-relaxed text-stone-700">
      <Link href="/" className="text-sm font-semibold text-accent-600">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-stone-900">Política de Privacidade</h1>
      <p className="text-sm text-stone-500">Atualizada em 20/11/2026.</p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Dados que coletamos</h2>
      <p>Nome, telefone (WhatsApp), e-mail, senha (guardada de forma criptografada) e, se você quiser, data de nascimento. Não coletamos CPF.</p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">O que cada estabelecimento vê</h2>
      <p>
        Cada estabelecimento onde você participa recebe seu nome, telefone, e-mail, data de nascimento e o histórico de consumo{' '}
        <strong>naquele estabelecimento</strong>, e pode exportar esses dados para gerir o programa. Ele nunca vê sua relação com outros
        estabelecimentos.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Consentimento de marketing</h2>
      <p>
        O consentimento para receber ofertas e notificações de promoção é separado do cadastro e vale por estabelecimento. Aceitar
        promoções de um não autoriza os outros. Você pode revogar quando quiser, em Conta.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Notificações no celular</h2>
      <p>
        Se você ativar as notificações no celular, guardamos o endereço que o seu navegador gera para isso. Dá para desligar a qualquer
        momento em Conta; sair da conta também desliga no aparelho.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Exclusão</h2>
      <p>
        Ao excluir a conta, seus dados pessoais são anonimizados. As movimentações permanecem para a auditoria dos estabelecimentos, mas
        sem identificar você.
      </p>
    </article>
  );
}
