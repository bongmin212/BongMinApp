-- Drop custom warranty months column from inventory
-- Safe operations with IF EXISTS to avoid failures on repeated runs

BEGIN;

-- Drop check constraint if it exists
ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS check_custom_warranty_months_positive;

-- Drop the column if it exists
ALTER TABLE inventory
  DROP COLUMN IF EXISTS custom_warranty_months;

COMMIT;


