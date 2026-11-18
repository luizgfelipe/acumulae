-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('MANAGER', 'ATTENDANT');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "ProgramScope" AS ENUM ('TENANT', 'STORE');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('CREDITO', 'ESTORNO_CREDITO', 'RECOMPENSA_LIBERADA', 'RECOMPENSA_CANCELADA', 'RESGATE', 'ESTORNO_RESGATE', 'EXPIRACAO');

-- CreateEnum
CREATE TYPE "LedgerSource" AS ENUM ('QR_PESSOAL', 'TELEFONE', 'QR_TEMPORARIO', 'SISTEMA', 'PAINEL');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('DISPONIVEL', 'RESGATADA', 'EXPIRADA', 'ESTORNADA');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT NOT NULL DEFAULT 'PILOTO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_memberships" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" "StaffRole" NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_store_access" (
    "staff_membership_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,

    CONSTRAINT "staff_store_access_pkey" PRIMARY KEY ("staff_membership_id","store_id")
);

-- CreateTable
CREATE TABLE "tenant_branding" (
    "tenant_id" UUID NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#E85D04',
    "background_color" TEXT,
    "text_color" TEXT,
    "label_color" TEXT,
    "cover_image_url" TEXT,
    "stamp_filled_url" TEXT,
    "stamp_empty_url" TEXT,
    "font_key" TEXT,
    "theme_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_branding_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "StaffRole" NOT NULL,
    "store_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sessions" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "tenant_id" UUID,
    "store_id" UUID,
    "device_label" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_password_reset_tokens" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_log" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "payload_summary" JSONB,
    "status_code" INTEGER,
    "source_ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_e164" TEXT,
    "email" TEXT,
    "birth_date" DATE,
    "password_hash" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "terms_accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identities" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "email_at_provider" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_label" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_label" TEXT NOT NULL DEFAULT 'selo',
    "unit_label_plural" TEXT,
    "goal" INTEGER NOT NULL DEFAULT 10,
    "reward_description" TEXT NOT NULL,
    "stamp_validity_days" INTEGER,
    "redeem_weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "max_per_entry" INTEGER NOT NULL DEFAULT 20,
    "scope" "ProgramScope" NOT NULL DEFAULT 'TENANT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "marketing_consent" BOOLEAN,
    "marketing_consent_at" TIMESTAMPTZ(3),
    "first_visit_at" TIMESTAMPTZ(3),
    "last_visit_at" TIMESTAMPTZ(3),
    "cached_balance" INTEGER NOT NULL DEFAULT 0,
    "cached_rewards_available" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "store_id" UUID,
    "membership_id" UUID NOT NULL,
    "type" "LedgerType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rewards_delta" INTEGER NOT NULL DEFAULT 0,
    "source" "LedgerSource" NOT NULL,
    "staff_user_id" UUID,
    "checkout_token_id" UUID,
    "reverses_entry_id" UUID,
    "parent_entry_id" UUID,
    "reward_id" UUID,
    "reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "stamps_cost" INTEGER NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "unlocked_entry_id" UUID NOT NULL,
    "source_entry_id" UUID,
    "redeemed_entry_id" UUID,
    "redeemed_at" TIMESTAMPTZ(3),
    "redeemed_store_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "used_by_customer_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stores_tenant_id_slug_key" ON "stores"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_memberships_staff_user_id_tenant_id_key" ON "staff_memberships"("staff_user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_hash_key" ON "staff_invites"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invites_tenant_id_email_idx" ON "staff_invites"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_refresh_token_hash_key" ON "staff_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "staff_sessions_staff_user_id_idx" ON "staff_sessions"("staff_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_password_reset_tokens_token_hash_key" ON "staff_password_reset_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_e164_key" ON "customers"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_provider_provider_subject_key" ON "customer_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_refresh_token_hash_key" ON "customer_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_idx" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "loyalty_programs_tenant_id_active_idx" ON "loyalty_programs"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "memberships_customer_id_idx" ON "memberships"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_customer_id_key" ON "memberships"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reverses_entry_id_key" ON "ledger_entries"("reverses_entry_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_created_at_idx" ON "ledger_entries"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_membership_id_created_at_idx" ON "ledger_entries"("membership_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_parent_entry_id_idx" ON "ledger_entries"("parent_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_tenant_id_idempotency_key_key" ON "ledger_entries"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_unlocked_entry_id_key" ON "rewards"("unlocked_entry_id");

-- CreateIndex
CREATE INDEX "rewards_membership_id_status_idx" ON "rewards"("membership_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_tokens_token_hash_key" ON "checkout_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "checkout_tokens_tenant_id_store_id_created_at_idx" ON "checkout_tokens"("tenant_id", "store_id", "created_at");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_store_access" ADD CONSTRAINT "staff_store_access_staff_membership_id_fkey" FOREIGN KEY ("staff_membership_id") REFERENCES "staff_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_store_access" ADD CONSTRAINT "staff_store_access_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_password_reset_tokens" ADD CONSTRAINT "staff_password_reset_tokens_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_checkout_token_id_fkey" FOREIGN KEY ("checkout_token_id") REFERENCES "checkout_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_tokens" ADD CONSTRAINT "checkout_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_tokens" ADD CONSTRAINT "checkout_tokens_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_tokens" ADD CONSTRAINT "checkout_tokens_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_tokens" ADD CONSTRAINT "checkout_tokens_used_by_customer_id_fkey" FOREIGN KEY ("used_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
