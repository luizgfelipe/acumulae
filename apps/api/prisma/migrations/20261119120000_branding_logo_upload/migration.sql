-- AlterTable
ALTER TABLE "tenant_branding" DROP COLUMN "logo_url",
ADD COLUMN     "logo_data" BYTEA,
ADD COLUMN     "logo_mime" TEXT;

