-- CreateEnum
CREATE TYPE "FeeMode" AS ENUM ('PER_CONTRACT_DOLLAR', 'PER_CONTRACT_PERCENT');

-- CreateTable
CREATE TABLE "AccountFee" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "mode" "FeeMode" NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountFee_accountId_assetClass_key" ON "AccountFee"("accountId", "assetClass");

-- AddForeignKey
ALTER TABLE "AccountFee" ADD CONSTRAINT "AccountFee_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
