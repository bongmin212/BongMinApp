-- Add is_active column to inventory table
-- Active: warehouses that are still valid OR expired but being sold
-- Not Active: expired without linked orders OR refunded orders

-- Step 1: Add the column with default value true
ALTER TABLE IF EXISTS public.inventory
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_inventory_is_active ON public.inventory (is_active);

-- Step 3: Migrate existing data

-- 3a. Set is_active = false for refunded inventories
UPDATE public.inventory
SET is_active = false
WHERE payment_status = 'REFUNDED';

-- 3b. Set is_active = false for expired inventories without:
--     - linked_order_id (classic inventory)
--     - any assigned profiles (account-based inventory)
UPDATE public.inventory inv
SET is_active = false
WHERE inv.expiry_date < NOW()
  AND (inv.linked_order_id IS NULL)
  AND (
    inv.is_account_based = false
    OR inv.is_account_based IS NULL
    OR (
      inv.is_account_based = true
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(inv.profiles) AS profile
        WHERE (profile->>'isAssigned')::boolean = true
      )
    )
  )
  AND inv.payment_status != 'REFUNDED'; -- Don't double-update refunded ones

-- Note: All other inventories remain is_active = true (the default)
