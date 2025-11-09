/*
  Warnings:

  - You are about to drop the column `setupId` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the `Playbook` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Setup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SetupChecklistItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Playbook" DROP CONSTRAINT "Playbook_userId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_playbookId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_strategyId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_userId_fkey";

-- DropForeignKey
ALTER TABLE "SetupChecklistItem" DROP CONSTRAINT "SetupChecklistItem_setupId_fkey";

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_setupId_fkey";

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_strategyId_fkey";

-- DropForeignKey
ALTER TABLE "TradeFill" DROP CONSTRAINT "TradeFill_tradeId_fkey";

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "setupId";

-- DropTable
DROP TABLE "Playbook";

-- DropTable
DROP TABLE "Setup";

-- DropTable
DROP TABLE "SetupChecklistItem";

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeFill" ADD CONSTRAINT "TradeFill_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
