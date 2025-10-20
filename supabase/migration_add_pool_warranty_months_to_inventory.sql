-- Add pool_warranty_months column for shared inventory pool items
-- Separate from removed custom_warranty_months; includes a positive check

BEGIN;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS pool_warranty_months INTEGER;

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS check_pool_warranty_months_positive;

ALTER TABLE inventory
  ADD CONSTRAINT check_pool_warranty_months_positive
  CHECK (pool_warranty_months IS NULL OR pool_warranty_months > 0);

COMMENT ON COLUMN inventory.pool_warranty_months IS 'Warranty months for shared pool inventory items.';

COMMIT;


