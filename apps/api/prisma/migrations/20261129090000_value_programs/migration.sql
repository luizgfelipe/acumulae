-- Programa por valor: R$ X na compra = 1 selo; o que sobra fica para a próxima compra.

-- CreateEnum
CREATE TYPE "ProgramKind" AS ENUM ('SELO', 'VALOR');

-- AlterTable
ALTER TABLE "loyalty_programs" ADD COLUMN     "kind" "ProgramKind" NOT NULL DEFAULT 'SELO',
ADD COLUMN     "stamp_value_cents" INTEGER,
ADD COLUMN     "max_amount_per_entry_cents" INTEGER;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "cached_leftover_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "amount_cents" INTEGER,
ADD COLUMN     "leftover_delta_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "checkout_tokens" ADD COLUMN     "amount_cents" INTEGER;

-- Programa por valor sempre tem o valor do selo.
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_value_kind_check"
  CHECK ("kind" <> 'VALOR' OR ("stamp_value_cents" IS NOT NULL AND "stamp_value_cents" > 0));
