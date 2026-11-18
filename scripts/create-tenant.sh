#!/usr/bin/env bash
# Cadastra um estabelecimento completo (tenant + unidade + programa + convite do gestor)
# com uma única chamada à API administrativa (RN-90 a RN-94).
#
# Uso:
#   ACUMULAE_URL=https://acumulae.com.br PLATFORM_API_KEY=... ./scripts/create-tenant.sh scripts/examples/tenant-sushi-x.json
#
# Respostas:
#   201 → criado; o JSON traz managerInviteUrl (envie ao gestor) e storeSignupQrUrl (QR do balcão)
#   409 → já existe um tenant com este slug (nada foi duplicado)
set -euo pipefail

FILE="${1:?Informe o arquivo JSON do estabelecimento}"
URL="${ACUMULAE_URL:-http://localhost:3000}"
KEY="${PLATFORM_API_KEY:?Defina PLATFORM_API_KEY}"

curl -sS -w '\nHTTP %{http_code}\n' \
  -X POST "$URL/api/platform/tenants" \
  -H "X-Platform-Key: $KEY" \
  -H 'Content-Type: application/json' \
  --data-binary "@$FILE"
