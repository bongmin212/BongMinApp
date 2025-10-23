-- Debug script to check inventory profiles vs orders inventory_profile_ids
-- Run this in Supabase SQL editor to see the actual data

-- Check inventory profiles for account-based items
SELECT 
  i.id as inventory_id,
  i.code as inventory_code,
  i.is_account_based,
  i.total_slots,
  i.profiles,
  i.status
FROM inventory i 
WHERE i.is_account_based = true
ORDER BY i.created_at DESC
LIMIT 10;

-- Check orders with inventory_profile_ids
SELECT 
  o.id as order_id,
  o.code as order_code,
  o.inventory_item_id,
  o.inventory_profile_ids,
  o.status as order_status
FROM orders o 
WHERE o.inventory_profile_ids IS NOT NULL 
  AND jsonb_array_length(o.inventory_profile_ids) > 0
ORDER BY o.created_at DESC
LIMIT 10;

-- Cross-check: find mismatches between inventory.profiles and orders.inventory_profile_ids
WITH inventory_profiles AS (
  SELECT 
    i.id as inventory_id,
    i.code as inventory_code,
    jsonb_array_elements(i.profiles) as profile
  FROM inventory i 
  WHERE i.is_account_based = true 
    AND i.profiles IS NOT NULL
),
order_profiles AS (
  SELECT 
    o.id as order_id,
    o.code as order_code,
    o.inventory_item_id,
    jsonb_array_elements_text(o.inventory_profile_ids) as profile_id
  FROM orders o 
  WHERE o.inventory_profile_ids IS NOT NULL
)
SELECT 
  'INVENTORY_PROFILE' as source,
  ip.inventory_id,
  ip.inventory_code,
  ip.profile->>'id' as profile_id,
  ip.profile->>'isAssigned' as is_assigned,
  ip.profile->>'assignedOrderId' as assigned_order_id,
  NULL as order_code
FROM inventory_profiles ip
WHERE ip.profile->>'isAssigned' = 'true'

UNION ALL

SELECT 
  'ORDER_PROFILE' as source,
  op.inventory_item_id as inventory_id,
  NULL as inventory_code,
  op.profile_id,
  NULL as is_assigned,
  op.order_id as assigned_order_id,
  op.order_code
FROM order_profiles op

ORDER BY inventory_id, profile_id;
