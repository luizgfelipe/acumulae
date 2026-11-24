# Decisões tomadas na implementação do MVP

Complementa a [especificação](../especificacao-mvp.md). Registra o que foi definido durante o desenvolvimento.

## Stack

| Camada | Escolha |
|---|---|
| API | NestJS 11 + Prisma 6 + PostgreSQL 16, validação com zod |
| Web | Next.js 15 (App Router, `output: standalone`) + Tailwind 4, um único app com as áreas `/` (cliente), `/caixa` e `/painel` |
| Integração | O Next repassa `/api/*` para a API: um domínio só, sem CORS, cookies httpOnly no mesmo site |
| Deploy | Docker Compose no Dokploy (ver [deploy-dokploy.md](deploy-dokploy.md)) |

## Itens em aberto da especificação (seguindo as sugestões)

- **Q-01**: o selo vale na rede inteira (`scope = TENANT`). O campo `STORE` existe, mas ainda não é aplicado.
- **Q-02**: o caixa orienta "cada um no seu cadastro". O limite por lançamento (padrão 20) evita abuso.
- **Q-03**: o app mostra só os estabelecimentos com vínculo.
- **Q-04**: o vínculo é criado já na entrada pelo QR do balcão (0/meta).
- **Q-05**: no MVP só vale a restrição por dia da semana. `stamp_validity_days` e `rewards.expires_at` existem, mas não há job de expiração (proposta em "Pendências conhecidas").

## Ledger

- Cada movimentação tem duas colunas: `quantity` (variação de **selos**) e `rewards_delta` (variação de **recompensas disponíveis**). O saldo é `Σ quantity` e as recompensas disponíveis são `Σ rewards_delta`.
- `RECOMPENSA_LIBERADA` converte `meta` selos em 1 recompensa (`quantity = -meta`, `rewards_delta = +1`).
- O tipo **`RECOMPENSA_CANCELADA`** foi acrescentado: é usado quando o estorno de um consumo cancela uma recompensa ainda não resgatada.
- **Estorno de consumo que liberou recompensa**: se a recompensa ainda está disponível, ela é cancelada e os selos voltam. Se já foi resgatada, o estorno é **bloqueado** até o gestor estornar o resgate.
- Cada recompensa guarda `stamps_cost` (a meta vigente quando foi liberada), então mudar a meta não afeta recompensas antigas (RN-24).
- O lançamento trava a linha da membership (`SELECT ... FOR UPDATE`) e usa chave de idempotência única por tenant.

## QR

- **QR pessoal**: `AC1.{customerId}.{período}.{hmac}`, gerado pelo servidor a cada 30 s, com 5 s de tolerância. Ao ler o QR, o caixa recebe um `customerRef` assinado. Para resgatar, ele precisa ter origem `QR_PESSOAL` e menos de 2 minutos.
- **QR temporário**: token base62 de 22 caracteres (cerca de 131 bits). Só o hash SHA-256 fica no banco, e o uso é atômico com `UPDATE ... WHERE used_at IS NULL`.

## Sessão

- O access token é um JWT de 15 min no cookie `acu_at`. O refresh token é opaco, rotativo, dura 180 dias e fica no cookie `acu_rt` (path `/api/auth`).
- O refresh anterior continua aceito por 60 s, para duas abas que renovam ao mesmo tempo. Se for reutilizado depois disso, a sessão é revogada.
- Os funcionários usam cookies separados (`acu_sat`/`acu_srt`), e o estabelecimento/unidade escolhido fica gravado na sessão.

## Funcionalidades além do esboço da especificação

- Login, refresh e recuperação de senha de funcionários (`/api/staff/auth/*`), que não estavam listados.
- `POST /api/me/memberships` (entrar pelo QR do balcão) e `GET /api/public/tenants/{slug}`.
- `POST /api/platform/reconcile` para conferir o ledger.
- Troca de senha do cliente; quem entrou só com login social pode criar uma senha.

## Pendências conhecidas (próximos passos)

- Restante da personalização visual (fundo, selos, temas), previsto para a Fase 2.
- **Expiração de selos e recompensas (Q-05)** — avaliada em 21/11/2026, fica como próxima tarefa. Já existem `loyalty_programs.stamp_validity_days`, `rewards.expires_at` e o tipo de ledger `EXPIRACAO`; falta a regra, o job, as telas e os avisos. Proposta:
  - **Opcional por programa, desligada por padrão.** O gestor liga em Programas e escolhe o prazo (30, 60, 90 ou 180 dias).
  - **Por inatividade, não selo a selo:** os selos vencem se o cliente ficar X dias sem visitar; cada visita renova o prazo do cartão inteiro.
  - **Avisos antes de vencer** (notificação no app e push, ex.: 7 dias antes e na véspera). É o aviso que traz o cliente de volta, não o selo sumir.
  - **Prazo visível** no cartão do app ("Selos válidos até 15/12"), na página do QR do balcão e no caixa; a expiração entra no histórico.
  - **Recompensa liberada com prazo próprio** (opcional, ex.: 30 dias), também com aviso.
  - **Sem efeito retroativo:** ao ligar, o prazo começa a contar a partir daquele dia para todos.
  - A decidir: por inatividade (recomendado) ou por selo; se a recompensa liberada também expira.
- Rate limit em Redis, caso a API rode em mais de uma instância.
- Correção de telefone e mesclagem de contas pelo admin da plataforma (suporte).
- Revisão jurídica dos Termos de Uso e da Política de Privacidade.
- **Origem do cadastro (por qual unidade e canal o cliente entrou)** — avaliado em 20/11/2026, fica para quando houver o primeiro cliente no plano Rede ou com mais de uma unidade:
  - Hoje o painel da Rede já atribui o cliente novo à unidade do **primeiro selo**. O `?u=` do QR de cada unidade só muda o nome no cartaz; não é gravado.
  - Proposta: guardar no cartão a unidade de entrada (do `?u=`) e, se fizer sentido, o canal (cartaz impresso × link/imagem nas redes, ex.: `?origem=link`), na entrada pelo `/e/{slug}` (`POST /api/me/memberships`).
  - Uso: "cadastros pelo QR" por unidade no painel da Rede (qual cartaz funciona) e o filtro **"Cadastrados que nunca voltaram"** (cartão sem nenhum selo) em Relatórios, com envio de notificação como os demais filtros.
  - O filtro "nunca voltaram" serve para todos os planos com relatórios, mesmo com uma unidade, e pode ser feito antes do resto.

## Revisões após o primeiro uso (19/11/2026)

- **Resgate manual (RN-52/RN-61 revisadas):** o resgate passou a funcionar também com o cliente encontrado pelo telefone. Com o cliente identificado, o caixa mostra **"Utilizar recompensa disponível"**, e o atendente escolhe quantas recompensas usar e confirma. Cada recompensa usada gera uma movimentação `RESGATE` com a origem (`QR_PESSOAL` ou `TELEFONE`). *Contrapartida:* quem souber o telefone de outra pessoa pode tentar usar a recompensa dela; a mitigação é o atendente conferir o nome, e o gestor pode estornar.
- **Resgate fica com o caixa (21/11/2026):** o resgate é sempre feito pelo atendente, lendo o QR pessoal do cliente ou buscando pelo telefone. O QR temporário do caixa (lido pelo cliente) continua servindo só para lançar selos. Risco do telefone considerado baixo: é difícil alguém saber se outra pessoa tem recompensa disponível. Os textos do app dizem "mostre seu QR ou informe seu telefone no caixa".
- **Logo enviado pelo gestor:** guardado no banco (`tenant_branding.logo_data`, `bytea`) em vez de URL. O navegador recorta o logo num quadrado de 256 px e o envia como data URL. A API aceita PNG, JPG ou WebP de até 200 KB e confere a assinatura do arquivo; SVG é recusado. O logo é servido em `GET /api/public/tenants/{slug}/logo?v={versão}` com cache longo. Quando a demanda crescer, dá para mover para um storage S3 sem mudar o frontend, porque o `logoUrl` continua sendo só uma URL.
- **Uma unidade por estabelecimento no MVP:** a aba Unidades saiu do painel. A nova aba **Perfil** reúne logo, cor, nome e endereço da unidade e o QR do balcão. O atendente convidado recebe automaticamente a única unidade. A API de unidades continua existindo para quando houver redes com várias lojas.

## Programas e planos (19/11/2026)

- **Planos de contratação:** a tabela `plans` (`code`, `name`, `max_active_programs`) é referenciada por `tenants.plan`. A migration cria o `PILOTO` com limite 1. Para criar ou alterar planos, use `PUT /api/platform/plans/{CODE}` com `{"name": "...", "maxActivePrograms": N}`; para trocar o plano de um estabelecimento, `PATCH /api/platform/tenants/{id}` com `{"plan": "CODE"}`. Reduzir o limite não desativa programas já ativos, só impede ativar novos.
- **Vários programas:** a chave do cartão passou de `(tenant, cliente)` para `(programa, cliente)`. Com mais de um programa ativo, o caixa escolhe o programa no lançamento, no resgate e no QR temporário. Com um só, nada muda para o atendente.
- **Consentimento de marketing:** continua sendo por estabelecimento. Aceitar ou recusar atualiza todos os cartões do cliente naquele estabelecimento, e cartões novos herdam a escolha.
- **Excedente:** configurável por programa (ver RN-37 na especificação). Num lançamento grande que passe de 2× a meta, o cliente ganha todas as recompensas completas e só o resto é descartado.

## Cores e modelo do cartão (19/11/2026)

- **Cor secundária e modelo do cartão:** `tenant_branding` ganhou `secondary_color` (opcional) e `card_style` (`CLASSICO`, `DEGRADE` ou `MOLDURA`, padrão `CLASSICO`). O gestor escolhe as duas cores e o modelo na aba **Perfil** do painel, com miniaturas dos três modelos; a plataforma também aceita os campos no `branding` do cadastro e da edição do estabelecimento.
  - **Clássico:** topo na principal; selos cheios, barra de progresso e botões na secundária.
  - **Degradê:** topo em degradê da principal para a secundária; selos e barra na principal.
  - **Moldura:** topo, selos e barra na principal; borda do cartão na secundária.
- **Sem secundária, nada muda:** com `secondary_color` nulo, a principal faz os dois papéis e os três modelos ficam iguais ao visual anterior. A cor do texto continua seguindo o mesmo limiar de luminância de antes; no degradê, vale a média das duas pontas.
- **Contraste:** os selos e a barra ficam sobre fundo branco. O painel avisa (sem bloquear) quando a cor deles tem contraste menor que 3:1 com o branco, e o ✓ do selo cheio troca para escuro sobre cores claras.

## Selo e convite de instalação (19/11/2026)

- **Ícone do selo:** cada estabelecimento escolhe, na aba Perfil, o ícone que aparece nos selos cheios (`tenant_branding.stamp_icon`, padrão `check`). O catálogo tem 15 ícones do lucide, em ordem fixa (`apps/api/src/common/stamps.ts`, espelhado em `apps/web/src/lib/stamp-icons.tsx`): os 5 primeiros (visto, estrela, coração, café, talheres) são do plano básico, e os outros 10 vêm nos planos acima.
- **Imagem própria do selo:** substitui o ícone. PNG, JPG ou WebP, reduzida a 128 px no navegador, até 64 KB, guardada no banco como o logo e servida em `GET /api/public/tenants/{slug}/stamp?v={versão}`.
- **Limites por plano:** `plans.max_stamp_icons` (quantos ícones do catálogo ficam liberados, os primeiros N; padrão 5) e `plans.custom_stamp_image` (padrão `false`), definidos em `PUT /api/platform/plans/{CODE}`. O `PILOTO` libera os 15 ícones e a imagem, como o Profissional. Fora do plano vigente, o ícone e a imagem deixam de aparecer (o selo volta ao ✓), mas ficam guardados e voltam num upgrade (ver "Planos e limites" abaixo).
- **Convite para instalar o app:** aparece só no celular e nunca com o app já instalado. Abre logo depois do cadastro (inclusive pelo login social), a cada selo ganho pelo QR temporário e como faixa na tela de cartões, que volta 3 dias depois de fechada. No Android o botão abre a instalação nativa (`beforeinstallprompt`); no iPhone, onde a Apple não permite isso, o convite mostra o passo a passo do Safari.

## Planos e limites (20/11/2026)

- **Grade:** semeada pelas migrations `20261120090000_plans_grid` e `20261121090000_pilot_professional` (os mesmos valores estão em `apps/api/src/plans/plans.ts`, usados pelos testes). Preços só informativos: a cobrança, o plano anual (2 meses grátis) e o kit de balcão ficam fora do sistema.

  | | PILOTO | ESSENCIAL | PROFISSIONAL | REDE |
  |---|---|---|---|---|
  | Preço/mês | grátis | R$ 69,90 | R$ 79,90 | R$ 199,90 |
  | Programas ativos | 3 | 1 | 3 | ilimitado |
  | Unidades inclusas / extra | 1 / R$ 39,90 | 1 / — | 1 / R$ 39,90 | 3 / R$ 49,90 |
  | Funcionários | ilimitado | 3 | ilimitado | ilimitado |
  | Ícones de selo / imagem própria | 15 / sim | 5 / não | 15 / sim | 15 / sim |
  | Cor secundária e modelos | sim | não | sim | sim |
  | Relatórios e CSV | sim | não | sim | sim |
  | Painel da rede | não | não | não | sim |
  | Notificações aos clientes por mês | 8 | 2 | 8 | 30 |
  | Suporte | WhatsApp | e-mail | WhatsApp | WhatsApp prioritário |

  O Essencial fica de propósito só R$ 10 abaixo do Profissional (estratégia do "chamariz"), para o Profissional parecer o melhor negócio.
- **Comparar planos em Meu plano** (`GET /api/admin/plans`): cards com preço, limites e recursos de cada plano, do mais barato ao mais caro, o atual em destaque e, nos outros, em verde o que têm a mais. Aparecem os planos com `plans.listed = true` e sempre o contratado; o Piloto vem com `listed = false` (só quem está nele o vê). A plataforma muda com `listed` em `PUT /api/platform/plans/{CODE}`. Trocar de plano continua pelo suporte.
- **Validade:** `tenants.plan_expires_at` (opcional). Depois dela vale o ESSENCIAL até a plataforma trocar o plano ou desativar o estabelecimento; o painel avisa 7 dias antes e mostra o plano vencido. Os pilotos ficam no `PILOTO` (mesmos recursos do Profissional, de graça) por 3 meses: criar o estabelecimento no PILOTO ou trocar para ele sem informar `planExpiresAt` define a validade para o fim do dia, daqui a 3 meses (`null` explícito deixa sem validade); sair do PILOTO sem informar a validade a descarta. Ao vencer, o piloto cai para o Essencial e vê no painel o que perdeu, o que ajuda a converter. A migration deu aos pilotos já cadastrados 3 meses a partir da data de cadastro.
- **Unidades extras:** `tenants.extra_stores` soma às inclusas no plano (não valem com o plano vencido).
- **Clientes ativos (24/11/2026):** os planos não limitam mais a quantidade de clientes (a coluna `plans.max_active_customers` foi removida). "Clientes ativos" (visita nos últimos 90 dias) continua só como indicador no painel da rede.
- **Funcionários:** contam gestores e atendentes ativos e os convites pendentes (um por e-mail).
- **Downgrade ou vencimento:** limites de quantidade (programas, unidades, funcionários) só bloqueiam criar, ativar, convidar ou reativar além do limite; nada é desativado. Recursos visuais fora do plano (cor secundária, modelo, ícones além dos liberados, imagem do selo) deixam de aparecer para o cliente, mas ficam guardados e voltam num upgrade.
- **Relatórios (Profissional e Rede):** aniversariantes do mês, inativos há 30/60/90 dias e por funcionário (lançamentos, % pelo telefone, créditos estornados e resgates; destaca quem usa o telefone 2× acima da média da equipe, com pelo menos 5 lançamentos). O CSV de clientes traz todos os clientes do estabelecimento que aceitaram os Termos de Uso atuais (ver "Versão dos Termos de Uso"), com a coluna "Aceita promoções" para saber a quem mandar ofertas; protege as células contra fórmulas e registra no log quem exportou.
- **Painel da rede (Rede):** compara as unidades no mês (visitas, selos, clientes novos pelo primeiro selo na unidade, resgates) e os clientes ativos de cada uma; o total de clientes ativos conta uma vez quem frequenta mais de uma unidade.
- **Como a plataforma administra:** `PUT /api/platform/plans/{CODE}` altera preços, limites (`null` = ilimitado) e recursos; `PATCH /api/platform/tenants/{id}` com `plan`, `planExpiresAt` (data, vale até o fim do dia, ou `null`) e `extraStores`.
- **Pendente:** o painel ainda não mostra um contato do suporte (e-mail ou WhatsApp) para pedir a troca de plano; e a origem do cadastro (unidade e canal pelo `?u=` do QR) ainda não é registrada (ver "Pendências conhecidas").

## Endereço pelo CEP e segmento (22/11/2026)

- **Endereço estruturado:** cada unidade guarda CEP, rua, número (vazio = S/N), complemento, bairro, cidade e UF; `stores.address` continua com a linha pronta ("Rua X, 123 - Bairro, Cidade/UF"), montada pela API, para quem só exibe. A API da plataforma ainda aceita `address` em texto livre (fica sem cidade/UF e não entra no filtro do guia); o painel só grava o formato estruturado. Endereços antigos em texto aparecem no painel como aviso até o gestor informar o CEP.
- **Busca do CEP:** `GET /api/admin/cep/{cep}` (só gestor). A API oficial dos Correios exige contrato, então usamos a BrasilAPI (que consulta os Correios e outras bases) com o ViaCEP de reserva; 3 s de timeout por serviço e cache em memória de 7 dias (inclusive para CEP inexistente). Fora do ar → 503 `CEP_UNAVAILABLE` e o gestor preenche à mão. A busca passa pela nossa API para não depender de CORS e poder trocar de serviço sem mexer no app.
- **Cidade e UF vindas do CEP ficam travadas** no formulário, para o guia não ter "Joinville", "joinville" e "Joinvile" como cidades diferentes. Só ficam livres quando o CEP não é encontrado.
- **Segmento:** um por estabelecimento (`tenants.segment`), escolhido no Perfil do painel ou definido pela plataforma (`segment` em `POST/PATCH /api/platform/tenants`). A lista fica em `apps/api/src/common/segments.ts` (código fixo, rótulo e grupo editáveis) e o painel a recebe pela API.
- **Guia de estabelecimentos (próximo passo):** o app vai listar por UF, cidade e segmento usando o índice `stores (state, city)`. Regras já decididas:
  - Aparecer no guia é autorização do estabelecimento, **ligada por padrão** (`tenants.show_in_directory`): o gestor desliga em Perfil → "Aparecer no guia do app"; a plataforma também pode mudar (`showInDirectory` em `POST/PATCH /api/platform/tenants`).
  - Só aparece **enquanto o estabelecimento estiver ativo** (`tenants.status = ACTIVE`): suspenso sai do guia na hora e volta ao ser reativado, sem mexer na autorização. Dentro dele, só as unidades ativas e com cidade/UF (endereço pelo CEP).


## Leitor de QR no app do cliente (20/11/2026)

- **Ler QR** (`/ler`, na barra de baixo e ao lado de "Meu QR" na tela de cartões): o cliente lê pela câmera do app o QR do balcão (`/e/{slug}`) ou o QR temporário do caixa (`/c/{token}`), sem precisar abrir a câmera do celular. O app só aproveita o caminho do link (nunca o domínio), então um QR de outro site é recusado em vez de virar redirecionamento. Se o cliente ler um QR pessoal (`AC1.`), o app avisa que é o QR de um cliente.

## Notificações no app do cliente (20/11/2026)

- **Sino no cabeçalho** com o número de não lidas e a tela `/notificacoes`. Sem WhatsApp ou e-mail; no celular, só para quem ativar o push (seção abaixo). O app confere as não lidas ao abrir, ao trocar de tela, ao voltar para o app e a cada minuto.
- **Automáticas** (tabela `notifications`), criadas na mesma transação da movimentação, então um replay pela chave de idempotência não duplica e um lançamento que falha não deixa notificação:
  - selos recebidos, com quanto falta para a recompensa;
  - recompensa liberada (quando o lançamento completa o cartão, vai só esta, não a dos selos);
  - recompensa resgatada;
  - estorno de consumo (com as recompensas canceladas e o saldo) e de resgate.
- **Notificações do estabelecimento** (painel → Notificações, chamadas de "avisos" no código e na tabela `announcements`; `POST /api/admin/announcements`, só gestor): título (até 80) e mensagem (até 500). Vão **só para quem aceitou promoções** daquele estabelecimento (consentimento da seção 10) e com conta ativa, uma notificação por cliente mesmo com 2 cartões no lugar. Sem ninguém para receber, o envio é recusado e não gasta o limite.
- **Paginação no servidor:** Clientes, Movimentações, Relatórios → Aniversariantes e Inativos (25 por página) e o histórico de notificações enviadas ("Ver mais antigas", 20 por vez). O envio pelos relatórios **não depende da página**: a API recebe só o filtro e seleciona todos do filtro no banco.
- **Envio pelos filtros dos relatórios** (Profissional e Rede): botão "Enviar notificação" em Relatórios → Aniversariantes (mês escolhido) e Inativos (30/60/90 dias). Vai para os clientes do filtro que aceitaram promoções; a prévia (`GET /api/admin/announcements/preview`) mostra quantos estão no filtro e quantos recebem. Cada envio conta 1 no limite do mês, igual ao envio para todos. O público fica gravado em `announcements.segment` (`all`, `birthdays:MM`, `inactive:DIAS`) e aparece no histórico.
- **Limite de notificações do estabelecimento por mês** no plano (`plans.max_announcements_per_month`, `null` = ilimitado; mês do calendário no horário de Brasília): Essencial 2, Profissional e Piloto 8, Rede 30. A plataforma altera com `maxAnnouncementsPerMonth` em `PUT /api/platform/plans/{CODE}`. O uso aparece em Notificações e em Meu plano.
- **Excluir a conta** apaga as notificações do cliente.
- **Telas do cliente sem "piscar":** Cartões, Meu QR, Ler QR, Conta, cartão e Notificações ficam no layout `app/(cliente)/layout.tsx`, que carrega o cliente uma vez e mantém o cabeçalho e o menu montados entre as trocas de tela.
- **Pendente:** notificações antigas não são apagadas automaticamente (avaliar uma limpeza depois de alguns meses).

## Notificações no celular (Web Push) (20/11/2026)

- **Quem ativar recebe no celular; quem não ativar continua vendo só no sino.** Ativa em Conta → "Notificações no celular" ou pelo convite na tela de Notificações. Vale por aparelho e pode ser desligado a qualquer momento.
- **Padrão Web Push com chaves VAPID** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; gerar uma vez com `npx web-push generate-vapid-keys`). Sem as chaves o recurso fica escondido no app. Trocar as chaves desativa o push de todos os aparelhos até cada cliente abrir o app de novo.
- **Onde funciona:** Android e computador no navegador ou no app instalado. No iPhone (iOS 16.4+) só com o Acumulaê na Tela de Início; fora dele o app explica como instalar.
- **Envio fora da transação:** a cada 3 s a API pega as notificações ainda não enviadas (`notifications.pushed_at` nulo, até 15 min, não lidas) de clientes com aparelho ativo, marca e envia. Usa `FOR UPDATE SKIP LOCKED`, então mais de uma instância da API não duplica. Cada notificação vai no máximo uma vez.
- **Quem ativa agora não recebe as antigas:** ao ativar o primeiro aparelho, as pendentes ficam só no sino.
- **Aparelhos** em `push_subscriptions` (até 10 por cliente). O endereço do navegador passa para quem logou por último; sair da conta desativa o aparelho; o serviço de push responder 404/410 remove o aparelho; excluir a conta apaga todos.
- **Segurança:** a API só envia para os serviços de push conhecidos (FCM, Mozilla, Apple, Windows) via HTTPS. Sem isso, um endereço cadastrado pelo cliente poderia fazer a API chamar endereços internos.
- **Ao tocar** na notificação, o app abre o cartão (ou a tela de Notificações) e a marca como lida. Com o app aberto, o sino atualiza na hora.

## Versão dos Termos de Uso (20/11/2026)

- Os Termos agora dizem que, ao participar do programa de um estabelecimento, ele recebe nome, telefone, e-mail, data de nascimento e o histórico naquele estabelecimento, e pode exportar esses dados. Ofertas e notificações de promoção continuam dependendo do consentimento por estabelecimento (seção 10).
- `customers.terms_version` guarda a versão aceita (`TERMS_VERSION` em `apps/api/src/common/terms.ts`). Quem aceitou antes do controle de versões fica com nulo.
- Quem aceitou uma versão antiga vê no app o aviso "Atualizamos os Termos de Uso" (`termsOutdated` em `/api/me`) e aceita com `POST /api/me/terms`; se não aceitar, pode sair da conta.
- **A exportação em CSV só inclui quem aceitou a versão com o compartilhamento** (`TERMS_DATA_SHARING_SINCE`). Ao mudar o texto dos termos, troque `TERMS_VERSION`.
- A lista de clientes e os relatórios do painel continuam mostrando o telefone completo só de quem aceitou promoções.
- **Pendente:** revisar o texto dos Termos e da Política com assessoria jurídica (LGPD) antes do lançamento.
