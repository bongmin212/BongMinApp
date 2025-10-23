-- Test migration script - AFTER
-- Run this AFTER running the main migration to verify results

-- Check data distribution after migration
SELECT 
  'After migration' as status,
  COUNT(*) as total_orders,
  COUNT(inventory_profile_id) as old_column_count,
  COUNT(inventory_profile_ids) as new_column_count,
  COUNT(CASE WHEN inventory_profile_ids IS NOT NULL AND jsonb_array_length(inventory_profile_ids) > 0 THEN 1 END) as new_column_with_data,
  COUNT(CASE WHEN inventory_profile_id IS NOT NULL AND inventory_profile_id != '' THEN 1 END) as old_column_with_data
FROM public.orders;

-- Show sample migrated data
SELECT 
  id, 
  code, 
  inventory_profile_id as old_column,
  inventory_profile_ids as new_column
FROM public.orders 
WHERE inventory_profile_ids IS NOT NULL AND jsonb_array_length(inventory_profile_ids) > 0
LIMIT 10;

-- Verify no data loss
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ No data loss - all data migrated successfully'
    ELSE '❌ Data loss detected - ' || COUNT(*) || ' records still in old column only'
  END as migration_status
FROM public.orders 
WHERE inventory_profile_id IS NOT NULL 
  AND inventory_profile_id != '' 
  AND (inventory_profile_ids IS NULL OR jsonb_array_length(inventory_profile_ids) = 0);
