-- Planos Essencial / Profissional / Rede: preços, limites, recursos e validade.
CREATE TYPE "SupportChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'WHATSAPP_PRIORITARIO');

ALTER TABLE "plans"
  ADD COLUMN "price_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_active_customers" INTEGER,
  ALTER COLUMN "max_active_programs" DROP NOT NULL,
  ADD COLUMN "included_stores" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "extra_store_price_cents" INTEGER,
  ADD COLUMN "max_staff" INTEGER DEFAULT 3,
  ADD COLUMN "card_customization" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reports" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "customer_export" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "network_dashboard" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "support_channel" "SupportChannel" NOT NULL DEFAULT 'EMAIL';

ALTER TABLE "tenants"
  ADD COLUMN "plan_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "extra_stores" INTEGER NOT NULL DEFAULT 0;

-- Grade padrão (a mesma de src/plans/plans.ts). PILOTO libera o mesmo que o ESSENCIAL, de graça.
INSERT INTO "plans" ("code", "name", "price_cents", "max_active_customers", "max_active_programs", "included_stores",
  "extra_store_price_cents", "max_staff", "max_stamp_icons", "custom_stamp_image", "card_customization", "reports",
  "customer_export", "network_dashboard", "support_channel", "updated_at")
VALUES
  ('PILOTO',       'Piloto',       0,     300,  1,    1, NULL, 3,    5,  false, false, false, false, false, 'EMAIL',                CURRENT_TIMESTAMP),
  ('ESSENCIAL',    'Essencial',    6990,  300,  1,    1, NULL, 3,    5,  false, false, false, false, false, 'EMAIL',                CURRENT_TIMESTAMP),
  ('PROFISSIONAL', 'Profissional', 7990,  1500, 3,    1, 3990, NULL, 15, true,  true,  true,  true,  false, 'WHATSAPP',             CURRENT_TIMESTAMP),
  ('REDE',         'Rede',         19990, NULL, NULL, 3, 4990, NULL, 15, true,  true,  true,  true,  true,  'WHATSAPP_PRIORITARIO', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "price_cents" = EXCLUDED."price_cents",
  "max_active_customers" = EXCLUDED."max_active_customers",
  "max_active_programs" = EXCLUDED."max_active_programs",
  "included_stores" = EXCLUDED."included_stores",
  "extra_store_price_cents" = EXCLUDED."extra_store_price_cents",
  "max_staff" = EXCLUDED."max_staff",
  "max_stamp_icons" = EXCLUDED."max_stamp_icons",
  "custom_stamp_image" = EXCLUDED."custom_stamp_image",
  "card_customization" = EXCLUDED."card_customization",
  "reports" = EXCLUDED."reports",
  "customer_export" = EXCLUDED."customer_export",
  "network_dashboard" = EXCLUDED."network_dashboard",
  "support_channel" = EXCLUDED."support_channel",
  "updated_at" = CURRENT_TIMESTAMP;
