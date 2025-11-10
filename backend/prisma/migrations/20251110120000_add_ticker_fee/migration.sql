-- CreateTable
CREATE TABLE "TickerFee" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    CONSTRAINT "TickerFee_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TickerFee_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TickerFee_accountId_symbol_key" ON "TickerFee" ("accountId", "symbol");