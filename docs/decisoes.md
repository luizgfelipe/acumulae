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
- **Q-05**: no MVP só vale a restrição por dia da semana. `stamp_validity_days` e `rewards.expires_at` existem, mas não há job de expiração.

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
- Job de expiração de selos/recompensas (Q-05).
- Rate limit em Redis, caso a API rode em mais de uma instância.
- Correção de telefone e mesclagem de contas pelo admin da plataforma (suporte).
- Revisão jurídica dos Termos de Uso e da Política de Privacidade.

## Revisões após o primeiro uso (19/11/2026)

- **Resgate manual (RN-52/RN-61 revisadas):** o resgate passou a funcionar também com o cliente encontrado pelo telefone. Com o cliente identificado, o caixa mostra **"Utilizar recompensa disponível"**, e o atendente escolhe quantas recompensas usar e confirma. Cada recompensa usada gera uma movimentação `RESGATE` com a origem (`QR_PESSOAL` ou `TELEFONE`). *Contrapartida:* quem souber o telefone de outra pessoa pode tentar usar a recompensa dela; a mitigação é o atendente conferir o nome, e o gestor pode estornar.
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
