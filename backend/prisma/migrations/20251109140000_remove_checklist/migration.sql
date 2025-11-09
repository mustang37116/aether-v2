-- Remove strategy checklist items table (playbook deprecated)
-- NOTE: Ensure no foreign key dependencies remain before dropping.

-- If existing data needs archiving, do it prior to this migration.

DROP TABLE IF EXISTS "StrategyChecklistItem";
