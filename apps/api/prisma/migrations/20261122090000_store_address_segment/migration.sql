-- Endereço estruturado da unidade (preenchido pelo CEP) e segmento do estabelecimento,
-- base para o guia de estabelecimentos por cidade/UF e segmento.
ALTER TABLE "stores"
  ADD COLUMN "cep" CHAR(8),
  ADD COLUMN "street" TEXT,
  ADD COLUMN "number" TEXT,
  ADD COLUMN "complement" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" CHAR(2);

CREATE INDEX "stores_state_city_idx" ON "stores"("state", "city");

ALTER TABLE "tenants" ADD COLUMN "segment" TEXT;
