import Link from 'next/link';

export const metadata = { title: 'Termos de Uso' };

// Texto-base para o MVP. Revisar com assessoria jurídica antes do lançamento.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-5 py-8 leading-relaxed text-stone-700">
      <Link href="/" className="text-sm font-semibold text-brand-700">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-stone-900">Termos de Uso</h1>
      <p>
        O Acumulaê é uma plataforma de programas de fidelidade. Sua conta é única e pertence à plataforma, e vale em todos os
        estabelecimentos participantes.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Programas de fidelidade</h2>
      <p>
        Cada estabelecimento define as regras do próprio programa (meta, recompensa, dias de resgate). Os selos de um estabelecimento não
        valem em outro. O estabelecimento é responsável por honrar as recompensas liberadas no seu programa.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Uso da conta</h2>
      <p>
        Você é responsável por manter sua senha em segurança. O resgate de recompensas é presencial e exige o QR pessoal exibido no seu
        celular. Tentativas de fraude podem levar ao estorno dos lançamentos e ao bloqueio da conta.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Encerramento</h2>
      <p>Você pode excluir sua conta a qualquer momento em Conta → Excluir minha conta.</p>
    </article>
  );
}
