/*
  Warnings:

  - You are about to drop the column `setupId` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `setupMode` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the `Playbook` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Setup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SetupChecklistItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
-- This migration only drops setupMode since playbook-related tables were already removed earlier.
ALTER TABLE "Trade" DROP COLUMN IF EXISTS "setupMode";
