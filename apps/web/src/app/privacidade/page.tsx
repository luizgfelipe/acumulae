import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/contact';
import { tr } from '@/lib/region';

export const metadata = { title: 'Política de Privacidade' };

// Texto-base para o MVP (LGPD, seção 10 da especificação). Revisar com assessoria jurídica.
// Versão PT (PtPrivacy): texto-base adaptado ao RGPD (Regulamento (UE) 2016/679) e à Lei n.º 58/2019;
// tem de ser revisto por um jurista em Portugal antes do lançamento.
export default function PrivacyPage() {
  return tr(<BrPrivacy />, <PtPrivacy />);
}

function BrPrivacy() {
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

function PtPrivacy() {
  const h2 = 'pt-2 text-lg font-semibold text-stone-900';
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-5 py-8 leading-relaxed text-stone-700">
      <Link href="/" className="text-sm font-semibold text-accent-600">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-stone-900">Política de Privacidade</h1>
      <p className="text-sm text-stone-500">Atualizada em 20/11/2026.</p>
      <p>
        Esta política explica como o Acumulaê trata os seus dados pessoais, nos termos do Regulamento Geral sobre a Proteção de Dados
        (Regulamento (UE) 2016/679, «RGPD») e da Lei n.º 58/2019, de 8 de agosto.
      </p>
      <h2 className={h2}>Responsável pelo tratamento</h2>
      <p>
        O Acumulaê é responsável pelo tratamento dos dados da sua conta na plataforma. Cada estabelecimento a cujo programa adere é
        responsável, por si, pelo tratamento que fizer dos dados que recebe (ver abaixo). Para qualquer questão sobre os seus dados,
        contacte-nos através de{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent-600">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
      <h2 className={h2}>Dados que recolhemos</h2>
      <p>
        Nome, telemóvel, e-mail, palavra-passe (guardada de forma cifrada) e, se o quiser indicar, data de nascimento. Não recolhemos o NIF.
      </p>
      <h2 className={h2}>Finalidades e fundamentos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Gerir a sua conta e os seus cartões de fidelização: execução do contrato que aceita ao registar-se (artigo 6.º, n.º 1, alínea b),
          do RGPD).
        </li>
        <li>
          Enviar ofertas e notificações promocionais de um estabelecimento: o seu consentimento, dado em separado para cada
          estabelecimento (artigo 6.º, n.º 1, alínea a), do RGPD).
        </li>
        <li>
          Manter o histórico de movimentos para auditoria e prevenção de fraude: interesse legítimo do Acumulaê e dos estabelecimentos
          (artigo 6.º, n.º 1, alínea f), do RGPD).
        </li>
      </ul>
      <h2 className={h2}>O que cada estabelecimento vê</h2>
      <p>
        Cada estabelecimento em que participa recebe o seu nome, telemóvel, e-mail, data de nascimento e o histórico de consumo{' '}
        <strong>nesse estabelecimento</strong>, e pode exportar esses dados para gerir o programa. Nunca vê a sua relação com outros
        estabelecimentos.
      </p>
      <h2 className={h2}>Consentimento de marketing</h2>
      <p>
        O consentimento para receber ofertas e notificações promocionais é separado do registo e é dado por estabelecimento. Aceitar
        promoções de um não autoriza os outros. Pode retirá-lo quando quiser, em Conta, sem que isso afete a licitude do tratamento feito
        antes.
      </p>
      <h2 className={h2}>Notificações no telemóvel</h2>
      <p>
        Se ativar as notificações no telemóvel, guardamos o endereço que o seu navegador gera para esse efeito. Pode desativá-las a
        qualquer momento em Conta; terminar sessão também as desativa no dispositivo.
      </p>
      <h2 className={h2}>Conservação e eliminação</h2>
      <p>
        Conservamos os seus dados enquanto a conta estiver ativa. Ao eliminar a conta, os seus dados pessoais são anonimizados. Os
        movimentos permanecem para a auditoria dos estabelecimentos, mas sem o identificar.
      </p>
      <h2 className={h2}>Idade mínima</h2>
      <p>
        Em Portugal, o consentimento para o tratamento de dados em serviços da sociedade da informação só pode ser dado pelo próprio a
        partir dos 13 anos (artigo 16.º da Lei n.º 58/2019). Abaixo dessa idade, é necessário o consentimento dos titulares das
        responsabilidades parentais.
      </p>
      <h2 className={h2}>Os seus direitos</h2>
      <p>Nos termos dos artigos 15.º a 22.º do RGPD, tem direito a:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Acesso</strong>: saber que dados seus tratamos e obter uma cópia;
        </li>
        <li>
          <strong>Retificação</strong>: corrigir dados inexatos ou incompletos;
        </li>
        <li>
          <strong>Apagamento</strong>: pedir a eliminação dos seus dados (pode fazê-lo diretamente em Conta, eliminando a conta);
        </li>
        <li>
          <strong>Portabilidade</strong>: receber os dados que nos forneceu num formato estruturado e de leitura automática;
        </li>
        <li>
          <strong>Oposição</strong>: opor-se ao tratamento baseado em interesse legítimo e, a qualquer momento, ao marketing;
        </li>
        <li>
          <strong>Limitação</strong>: pedir que o tratamento fique suspenso enquanto se verifica um pedido seu;
        </li>
        <li>
          <strong>Retirar o consentimento</strong> a qualquer momento, sem afetar o tratamento feito antes.
        </li>
      </ul>
      <p>
        Para exercer estes direitos, escreva para{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent-600">
          {CONTACT_EMAIL}
        </a>
        . Quanto aos dados que um estabelecimento tem sobre si, pode também dirigir-se diretamente a ele. Tem ainda o direito de
        apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD), em www.cnpd.pt.
      </p>
    </article>
  );
}
