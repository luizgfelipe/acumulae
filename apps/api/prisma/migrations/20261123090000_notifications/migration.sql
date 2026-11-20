-- Notificações no app do cliente e avisos do estabelecimento (limite mensal por plano).

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('CREDITO', 'RECOMPENSA_LIBERADA', 'RESGATE', 'ESTORNO', 'AVISO');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "max_announcements_per_month" INTEGER DEFAULT 2;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "tenant_id" UUID,
    "membership_id" UUID,
    "announcement_id" UUID,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_customer_id_created_at_idx" ON "notifications"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_customer_id_read_at_idx" ON "notifications"("customer_id", "read_at");

-- CreateIndex
CREATE INDEX "announcements_tenant_id_created_at_idx" ON "announcements"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Avisos por mês na grade padrão (src/plans/plans.ts). null = ilimitado.
UPDATE "plans" SET "max_announcements_per_month" = 2 WHERE "code" = 'ESSENCIAL';
UPDATE "plans" SET "max_announcements_per_month" = 8 WHERE "code" IN ('PROFISSIONAL', 'PILOTO');
UPDATE "plans" SET "max_announcements_per_month" = 30 WHERE "code" = 'REDE';
