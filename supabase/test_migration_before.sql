-- Test migration script
-- Run this BEFORE running the main migration to check current state

-- Check current data distribution
SELECT 
  'Current state before migration' as status,
  COUNT(*) as total_orders,
  COUNT(inventory_profile_id) as old_column_count,
  COUNT(inventory_profile_ids) as new_column_count,
  COUNT(CASE WHEN inventory_profile_ids IS NOT NULL AND jsonb_array_length(inventory_profile_ids) > 0 THEN 1 END) as new_column_with_data,
  COUNT(CASE WHEN inventory_profile_id IS NOT NULL AND inventory_profile_id != '' THEN 1 END) as old_column_with_data
FROM public.orders;

-- Show sample data
SELECT 
  id, 
  code, 
  inventory_profile_id as old_column,
  inventory_profile_ids as new_column
FROM public.orders 
WHERE inventory_profile_id IS NOT NULL OR inventory_profile_ids IS NOT NULL
LIMIT 10;
