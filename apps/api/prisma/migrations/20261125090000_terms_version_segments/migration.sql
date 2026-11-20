-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "terms_version" TEXT;

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "segment" TEXT NOT NULL DEFAULT 'all';

