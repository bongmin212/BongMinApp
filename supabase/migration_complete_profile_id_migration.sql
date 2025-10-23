-- Migration: Complete migration from inventory_profile_id to inventory_profile_ids
-- Run this in Supabase SQL editor

-- Step 1: Migrate all remaining data from old column to new column
UPDATE public.orders 
SET inventory_profile_ids = jsonb_build_array(inventory_profile_id)
WHERE inventory_profile_id IS NOT NULL 
  AND inventory_profile_id != '' 
  AND (inventory_profile_ids IS NULL OR jsonb_array_length(inventory_profile_ids) = 0);

-- Step 2: Verify migration completed
SELECT 
  COUNT(*) as total_orders,
  COUNT(inventory_profile_id) as old_column_count,
  COUNT(inventory_profile_ids) as new_column_count,
  COUNT(CASE WHEN inventory_profile_ids IS NOT NULL AND jsonb_array_length(inventory_profile_ids) > 0 THEN 1 END) as new_column_with_data
FROM public.orders;

-- Step 3: Drop the old column (uncomment when ready)
-- ALTER TABLE public.orders DROP COLUMN inventory_profile_id;

-- Step 4: Add comment for clarity
COMMENT ON COLUMN public.orders.inventory_profile_ids IS 'Array of profile IDs for multi-slot orders - replaces inventory_profile_id';
