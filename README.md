# Acumulae

Plataforma SaaS de fidelidade para food service (cartão fidelidade digital). Especificação: [especificacao-mvp.md](especificacao-mvp.md).

## Estrutura

```
apps/api   API (NestJS + Prisma + PostgreSQL)
apps/web   App web (Next.js): PWA do cliente, tela de caixa e painel do gestor
scripts/   Scripts de apoio (cadastro de estabelecimento, banco de teste)
```

## Rodando localmente

```bash
cp .env.example .env
docker compose up --build
```
