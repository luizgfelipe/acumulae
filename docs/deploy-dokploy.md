# Deploy na VPS com Dokploy

Resumo: o Dokploy clona o repositório do GitHub, roda `docker-compose.prod.yml` e o Traefik dele publica o serviço `web` em `https://acumulae.com.br` com certificado Let's Encrypt. A API e o banco ficam só na rede interna.

```
Internet ──HTTPS──▶ Traefik (Dokploy) ──▶ web:3000 (Next.js) ──/api/*──▶ api:3001 (NestJS) ──▶ postgres:5432
```

## 1. Repositório no GitHub

```bash
git remote add origin git@github.com:<seu-usuario>/acumulae.git
git push -u origin main
```

No Dokploy: **Settings → Git → GitHub** e autorize o acesso ao repositório (repositório privado funciona).

## 2. DNS

No Registro.br (ou no provedor de DNS do domínio), crie os registros apontando para o IP da VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (acumulae.com.br) | IP da VPS |
| A | `www` | IP da VPS (opcional) |

## 3. Criar o serviço

1. **Projects → Create Project** "Acumulae" → **Create Service → Compose**.
2. Provider: **GitHub**, repositório `acumulae`, branch `main`.
3. Compose Path: `./docker-compose.prod.yml`.
4. Aba **Environment**: cole as variáveis abaixo (gere os segredos com `openssl rand -base64 48`).

```env
PUBLIC_URL=https://acumulae.com.br
POSTGRES_USER=acumulae
POSTGRES_PASSWORD=<senha forte>
POSTGRES_DB=acumulae
JWT_SECRET=<segredo>
QR_SECRET=<segredo>
PLATFORM_API_KEY=<chave longa; usada pelo script de cadastro>
PLATFORM_ALLOWED_IPS=

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<usuário SMTP>
SMTP_PASS=<senha SMTP>
MAIL_FROM=Acumulae <nao-responda@acumulae.com.br>

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_ENABLED=false
```

> Atenção: **não troque `JWT_SECRET` nem `QR_SECRET` depois de entrar em produção.** Trocar o `JWT_SECRET` derruba as sessões, e trocar o `QR_SECRET` invalida os QRs abertos naquele momento.

5. Aba **Domains → Add Domain**: host `acumulae.com.br`, path `/`, **Service Name `web`**, **Container Port `3000`**, HTTPS ligado, certificado **Let's Encrypt**.
6. **Deploy**. Na primeira subida, a API aplica as migrations do banco sozinha.
7. Ative o **Auto Deploy** (webhook do GitHub) para publicar a cada push na branch.

Para conferir: `https://acumulae.com.br/api/health` deve responder `{"status":"ok"}`.

## 4. Cadastrar o primeiro estabelecimento

```bash
ACUMULAE_URL=https://acumulae.com.br PLATFORM_API_KEY=<chave> \
  ./scripts/create-tenant.sh scripts/examples/tenant-sushi-x.json
```

A resposta traz:
- `managerInviteUrl`: envie ao gestor (o link também vai por e-mail). Vale 72 h e só pode ser usado uma vez.
- `storeSignupQrUrl`: o link do QR do balcão. O gestor também imprime o QR em **Painel → Perfil**.

Outras operações da API da plataforma (todas com o header `X-Platform-Key`):

| Ação | Chamada |
|---|---|
| Listar estabelecimentos | `GET /api/platform/tenants` |
| Suspender / reativar | `POST /api/platform/tenants/{id}/suspend` · `/reactivate` |
| Nova unidade | `POST /api/platform/tenants/{id}/stores` |
| Novo convite de gestor | `POST /api/platform/tenants/{id}/invites` `{"email": "...", "role": "MANAGER"}` |
| Reconciliar saldos com o ledger | `POST /api/platform/reconcile` (acrescente `?fix=true` para corrigir) |

## 5. Login com Google (opcional)

1. No Google Cloud Console: **APIs & Services → Credentials → Create OAuth client ID → Web application**.
2. **Authorized redirect URI**: `https://acumulae.com.br/api/auth/oauth2/google/callback`.
3. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no Dokploy e faça redeploy. O botão aparece sozinho.

O login com Apple segue a mesma ideia (Service ID + chave `.p8`), com `APPLE_ENABLED=true`. Depende da assinatura do Apple Developer Program.

## 6. Backup do banco

O Postgres fica no volume `pgdata`. Opções:
- agendar no Dokploy (**Schedules**) ou no cron da VPS:
  `docker exec <container-postgres> pg_dump -U acumulae acumulae | gzip > /backups/acumulae-$(date +%F).sql.gz`;
- ou migrar para um **Database → PostgreSQL** gerenciado pelo Dokploy, que tem backup automático para S3. Nesse caso, troque o `DATABASE_URL` da API e remova o serviço `postgres` do compose.

Guarde os backups fora da VPS (S3, Backblaze B2 etc.).

## Observações

- O limite de tentativas de login fica em memória: vale para **uma** instância da API. Para escalar horizontalmente, mova esse limite para o Redis.
- A câmera do caixa e a instalação da PWA exigem HTTPS, que o Traefik do Dokploy já fornece.
