-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "hasActiveInvestments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "hasActiveDebts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "wantsCapitalGrowth" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "wantsFinancialLiteracy" BOOLEAN NOT NULL DEFAULT false;
