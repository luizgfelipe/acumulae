-- Cor secundária e modelo de cartão escolhidos pelo estabelecimento.
CREATE TYPE "CardStyle" AS ENUM ('CLASSICO', 'DEGRADE', 'MOLDURA');

ALTER TABLE "tenant_branding"
  ADD COLUMN "secondary_color" TEXT,
  ADD COLUMN "card_style" "CardStyle" NOT NULL DEFAULT 'CLASSICO';
