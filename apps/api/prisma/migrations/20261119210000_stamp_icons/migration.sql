-- Ícone do selo por estabelecimento e os limites de ícones e imagem própria por plano.
ALTER TABLE "plans"
  ADD COLUMN "max_stamp_icons" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "custom_stamp_image" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tenant_branding"
  ADD COLUMN "stamp_icon" TEXT NOT NULL DEFAULT 'check',
  ADD COLUMN "stamp_image_data" BYTEA,
  ADD COLUMN "stamp_image_mime" TEXT;
