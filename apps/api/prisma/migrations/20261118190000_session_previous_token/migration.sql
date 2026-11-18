-- AlterTable
ALTER TABLE "customer_sessions" ADD COLUMN     "previous_token_hash" TEXT;

-- AlterTable
ALTER TABLE "staff_sessions" ADD COLUMN     "previous_token_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_previous_token_hash_key" ON "customer_sessions"("previous_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_previous_token_hash_key" ON "staff_sessions"("previous_token_hash");

