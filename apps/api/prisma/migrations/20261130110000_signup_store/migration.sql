-- Unidade de cadastro no cartão e unidade (opcional) da notificação do estabelecimento.

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "signup_store_id" UUID;
ALTER TABLE "announcements" ADD COLUMN "store_id" UUID;

-- CreateIndex
CREATE INDEX "memberships_signup_store_id_idx" ON "memberships"("signup_store_id");
CREATE INDEX "ledger_entries_store_id_membership_id_idx" ON "ledger_entries"("store_id", "membership_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_signup_store_id_fkey" FOREIGN KEY ("signup_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cartões existentes: a unidade do primeiro lançamento; sem lançamento, a única unidade do estabelecimento (se houver só uma).
UPDATE "memberships" m SET "signup_store_id" = (
  SELECT l."store_id" FROM "ledger_entries" l
  WHERE l."membership_id" = m."id" AND l."store_id" IS NOT NULL
  ORDER BY l."created_at" ASC LIMIT 1
)
WHERE m."signup_store_id" IS NULL;

UPDATE "memberships" m SET "signup_store_id" = s."id"
FROM "stores" s
WHERE m."signup_store_id" IS NULL AND s."tenant_id" = m."tenant_id"
  AND (SELECT COUNT(*) FROM "stores" s2 WHERE s2."tenant_id" = m."tenant_id") = 1;
