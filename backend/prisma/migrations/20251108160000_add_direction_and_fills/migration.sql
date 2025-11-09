-- Add enum TradeDirection
CREATE TYPE "TradeDirection" AS ENUM ('LONG','SHORT');
-- Add enum TradeFillType
CREATE TYPE "TradeFillType" AS ENUM ('ENTRY','EXIT');

-- Add column direction to Trade (nullable for back-compat)
ALTER TABLE "Trade" ADD COLUMN "direction" "TradeDirection";

-- Create TradeFill table
CREATE TABLE "TradeFill" (
  "id" TEXT PRIMARY KEY,
  "tradeId" TEXT NOT NULL,
  "type" "TradeFillType" NOT NULL,
  "price" DECIMAL(18,6) NOT NULL,
  "size" DECIMAL(18,4) NOT NULL,
  "time" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeFill_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TradeFill_tradeId_idx" ON "TradeFill" ("tradeId");
