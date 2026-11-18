# Acumulae

Plataforma SaaS de fidelidade para food service: o cartão fidelidade de papel vira uma conta única do cliente, com programa próprio em cada estabelecimento.

- Especificação: [especificacao-mvp.md](especificacao-mvp.md)
- Decisões de implementação: [docs/decisoes.md](docs/decisoes.md)
- Deploy (VPS + Dokploy): [docs/deploy-dokploy.md](docs/deploy-dokploy.md)

## Estrutura

```
apps/api    API — NestJS 11 + Prisma 6 + PostgreSQL 16
apps/web    App web — Next.js 15 (PWA do cliente, /caixa e /painel)
scripts/    create-tenant.sh (cadastro de estabelecimento) e banco de teste
docs/       Deploy e decisões
docker-compose.yml       desenvolvimento local
docker-compose.prod.yml  produção (Dokploy)
```

## Rodando localmente

Requisito: Docker.

```bash
cp .env.example .env
docker compose up --build
```

| Serviço | URL |
|---|---|
| App (cliente) | http://localhost:3000 |
| Caixa | http://localhost:3000/caixa |
| Painel do gestor | http://localhost:3000/painel |
| API (health) | http://localhost:3000/api/health |
| E-mails de teste (Mailpit) | http://localhost:8025 |

### Primeiro estabelecimento

```bash
ACUMULAE_URL=http://localhost:3000 PLATFORM_API_KEY=troque-esta-chave-da-plataforma \
  ./scripts/create-tenant.sh scripts/examples/tenant-sushi-x.json
```

Abra o `managerInviteUrl` da resposta (o convite também chega no Mailpit), defina a senha do gestor e pronto: o caixa e o painel já funcionam. O cliente entra pelo `storeSignupQrUrl` (`/e/sushi-x`) ou se cadastra na hora, pelo QR temporário gerado no caixa.

> A câmera do caixa só funciona em `localhost` ou HTTPS. Para testar em um celular na rede local, use o campo "Digitar/colar o código manualmente" ou um túnel HTTPS.

## Desenvolvimento sem Docker (hot reload)

```bash
docker compose up -d postgres mailpit

# API
cd apps/api
npm install
DATABASE_URL=postgresql://acumulae:acumulae@localhost:5432/acumulae SMTP_HOST=localhost SMTP_PORT=1025 \
  PLATFORM_API_KEY=dev npx prisma migrate deploy && npm run start:dev

# Web (outro terminal)
cd apps/web
npm install
API_INTERNAL_URL=http://localhost:3001 npm run dev
```

## Testes

Os testes de integração rodam contra o banco `acumulae_test`, criado pelo compose de desenvolvimento, e cobrem os critérios de aceite da seção 14 da especificação.

```bash
docker compose up -d postgres
cd apps/api && npm run test:e2e
```

## Migrations

```bash
cd apps/api
# depois de alterar prisma/schema.prisma:
DATABASE_URL=postgresql://acumulae:acumulae@localhost:5432/acumulae npx prisma migrate dev --name <descricao>
```

Em produção, a API roda `prisma migrate deploy` ao subir.
