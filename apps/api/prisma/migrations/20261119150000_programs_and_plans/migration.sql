-- Vários programas por estabelecimento, limitados pelo plano de contratação,
-- e opção de guardar (ou descartar) o excedente da meta.

-- Novos tipos de movimentação
ALTER TYPE "LedgerType" ADD VALUE 'EXCEDENTE_DESCARTADO';
ALTER TYPE "LedgerType" ADD VALUE 'ESTORNO_EXCEDENTE';

-- Planos de contratação
CREATE TABLE "plans" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_active_programs" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

INSERT INTO "plans" ("code", "name", "max_active_programs") VALUES ('PILOTO', 'Piloto', 1);
-- Garante um plano para qualquer valor já usado pelos estabelecimentos.
INSERT INTO "plans" ("code", "name", "max_active_programs")
SELECT DISTINCT t."plan", t."plan", 1 FROM "tenants" t
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_fkey"
  FOREIGN KEY ("plan") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Programas: nome e excedente
ALTER TABLE "loyalty_programs"
  ADD COLUMN "carry_over_excess" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Programa de fidelidade';

-- Um cartão por programa (antes: um por estabelecimento)
DROP INDEX "memberships_tenant_id_customer_id_key";
CREATE UNIQUE INDEX "memberships_program_id_customer_id_key" ON "memberships"("program_id", "customer_id");
CREATE INDEX "memberships_tenant_id_customer_id_idx" ON "memberships"("tenant_id", "customer_id");

-- QR temporário passa a indicar o programa; os existentes ficam com o programa mais antigo do estabelecimento.
ALTER TABLE "checkout_tokens" ADD COLUMN "program_id" UUID;
UPDATE "checkout_tokens" ct SET "program_id" = (
  SELECT p."id" FROM "loyalty_programs" p WHERE p."tenant_id" = ct."tenant_id" ORDER BY p."created_at" ASC LIMIT 1
);
DELETE FROM "checkout_tokens" WHERE "program_id" IS NULL;
ALTER TABLE "checkout_tokens" ALTER COLUMN "program_id" SET NOT NULL;
ALTER TABLE "checkout_tokens" ADD CONSTRAINT "checkout_tokens_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
