#!/bin/sh
set -e
# Aplica as migrations pendentes antes de subir a API.
# A CLI do Prisma fica em dependencies para estar disponível aqui.
if [ -x ./node_modules/.bin/prisma ]; then
  ./node_modules/.bin/prisma migrate deploy
fi
exec node dist/main.js
