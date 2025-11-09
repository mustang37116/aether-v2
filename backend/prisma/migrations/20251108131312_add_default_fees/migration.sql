-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "defaultFeePerMicroContract" DECIMAL(18,2),
ADD COLUMN     "defaultFeePerMiniContract" DECIMAL(18,2);
