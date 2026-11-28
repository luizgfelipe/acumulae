import Link from 'next/link';
import { tr } from '@/lib/region';

export const metadata = { title: tr('Termos de Uso', 'Termos de Utilização') };

// Texto-base para o MVP. Revisar com assessoria jurídica antes do lançamento.
// Versão PT (PtTerms): texto-base adaptado à lei portuguesa e ao RGPD; tem de ser revisto por um jurista em Portugal antes do lançamento.
export default function TermsPage() {
  return tr(<BrTerms />, <PtTerms />);
}

function BrTerms() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-5 py-8 leading-relaxed text-stone-700">
      <Link href="/" className="text-sm font-semibold text-accent-600">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-stone-900">Termos de Uso</h1>
      <p className="text-sm text-stone-500">Atualizados em 20/11/2026.</p>
      <p>
        O Acumulaê é uma plataforma de programas de fidelidade. Sua conta é única e pertence à plataforma, e vale em todos os
        estabelecimentos participantes.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Programas de fidelidade</h2>
      <p>
        Cada estabelecimento define as regras do próprio programa (meta, recompensa, dias de resgate). Os selos de um estabelecimento não
        valem em outro. O estabelecimento é responsável por honrar as recompensas liberadas no seu programa.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Dados compartilhados com os estabelecimentos</h2>
      <p>
        Ao participar do programa de um estabelecimento (no primeiro lançamento ou ao entrar pelo link dele), você autoriza que ele receba
        seu nome, telefone, e-mail e data de nascimento, além do seu histórico <strong>naquele</strong> estabelecimento (selos, resgates e
        visitas). O estabelecimento pode consultar e exportar esses dados para gerir o próprio programa e o relacionamento com você, e passa a
        responder pelo uso que fizer deles. Ele nunca vê sua participação em outros estabelecimentos.
      </p>
      <p>
        Mandar ofertas e notificações de promoção é diferente: depende da sua autorização para cada estabelecimento, que você dá ou revoga
        quando quiser em Conta → Promoções.
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

function PtTerms() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-5 py-8 leading-relaxed text-stone-700">
      <Link href="/" className="text-sm font-semibold text-accent-600">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-stone-900">Termos de Utilização</h1>
      <p className="text-sm text-stone-500">Atualizados em 20/11/2026.</p>
      <p>
        O Acumulaê é uma plataforma de programas de fidelização. A sua conta é única, pertence à plataforma e é válida em todos os
        estabelecimentos aderentes.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Programas de fidelização</h2>
      <p>
        Cada estabelecimento define as regras do seu programa (objetivo, recompensa, dias de resgate). Os carimbos de um estabelecimento
        não são válidos noutro. O estabelecimento é responsável por cumprir as recompensas desbloqueadas no seu programa.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Dados partilhados com os estabelecimentos</h2>
      <p>
        Ao aderir ao programa de um estabelecimento (no primeiro registo de consumo ou ao entrar pela ligação dele), o estabelecimento passa
        a receber o seu nome, telemóvel, e-mail e data de nascimento, bem como o seu histórico <strong>nesse</strong> estabelecimento
        (carimbos, resgates e visitas). Esse tratamento destina-se à execução do programa a que aderiu, nos termos do artigo 6.º, n.º 1,
        alínea b), do Regulamento Geral sobre a Proteção de Dados (Regulamento (UE) 2016/679, «RGPD»). O estabelecimento pode consultar e
        exportar esses dados para gerir o próprio programa e a relação consigo, e passa a ser responsável pelo tratamento que deles fizer.
        Nunca vê a sua participação noutros estabelecimentos.
      </p>
      <p>
        O envio de ofertas e notificações promocionais é diferente: depende do seu consentimento para cada estabelecimento, que pode dar ou
        retirar quando quiser em Conta → Promoções. Retirar o consentimento não afeta a licitude do tratamento feito antes.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Idade mínima</h2>
      <p>
        Para criar conta e consentir no tratamento dos seus dados tem de ter, pelo menos, 13 anos, conforme o artigo 16.º da Lei
        n.º 58/2019. Abaixo dessa idade, o consentimento tem de ser dado pelos titulares das responsabilidades parentais.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Utilização da conta</h2>
      <p>
        É responsável por manter a sua palavra-passe em segurança. O resgate de recompensas é presencial e exige o QR pessoal apresentado
        no seu telemóvel. Tentativas de fraude podem levar à anulação dos registos e ao bloqueio da conta.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Proteção de dados</h2>
      <p>
        O tratamento dos seus dados pessoais segue o RGPD e a Lei n.º 58/2019 e está descrito na{' '}
        <Link href="/privacidade" className="font-semibold text-accent-600">
          Política de Privacidade
        </Link>
        , onde encontra também os seus direitos e como os exercer.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Encerramento</h2>
      <p>Pode eliminar a sua conta a qualquer momento em Conta → Eliminar a minha conta.</p>
      <h2 className="pt-2 text-lg font-semibold text-stone-900">Lei aplicável</h2>
      <p>
        Estes Termos regem-se pela lei portuguesa. Sem prejuízo das normas imperativas de proteção do consumidor, os litígios serão
        resolvidos nos tribunais portugueses competentes. Pode também recorrer a uma entidade de resolução alternativa de litígios de
        consumo ou ao Livro de Reclamações Eletrónico.
      </p>
    </article>
  );
}
