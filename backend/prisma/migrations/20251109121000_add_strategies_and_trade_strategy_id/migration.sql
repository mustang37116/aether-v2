-- Create Strategy and related tables, and add Trade.strategyId

-- CreateTable Strategy
CREATE TABLE "Strategy" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Enforce unique strategy name per user
CREATE UNIQUE INDEX "Strategy_userId_name_key" ON "Strategy" ("userId", "name");

-- FK to User
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable StrategyChecklistItem
CREATE TABLE "StrategyChecklistItem" (
  "id" TEXT PRIMARY KEY,
  "strategyId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Index for StrategyChecklistItem.strategyId
CREATE INDEX "StrategyChecklistItem_strategyId_idx" ON "StrategyChecklistItem" ("strategyId");

-- FK to Strategy
ALTER TABLE "StrategyChecklistItem" ADD CONSTRAINT "StrategyChecklistItem_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable StrategyTag
CREATE TABLE "StrategyTag" (
  "id" TEXT PRIMARY KEY,
  "strategyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Unique tag name per strategy
CREATE UNIQUE INDEX "StrategyTag_strategyId_name_key" ON "StrategyTag" ("strategyId", "name");

-- FK to Strategy
ALTER TABLE "StrategyTag" ADD CONSTRAINT "StrategyTag_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable Trade: add nullable strategyId with FK to Strategy
ALTER TABLE "Trade" ADD COLUMN "strategyId" TEXT;

ALTER TABLE "Trade" ADD CONSTRAINT "Trade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
