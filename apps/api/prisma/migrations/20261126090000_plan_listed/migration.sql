-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "listed" BOOLEAN NOT NULL DEFAULT true;


-- O Piloto não aparece na comparação de planos (só quem está nele o vê).
UPDATE "plans" SET "listed" = false WHERE "code" = 'PILOTO';
