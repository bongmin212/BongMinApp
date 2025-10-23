-- Fix only the SOLD inventory items without linked orders
-- This is the only issue found in your database

-- 1. First, let's see what these items are
SELECT 
    id,
    code,
    status,
    linked_order_id,
    product_id,
    package_id,
    created_at
FROM inventory 
WHERE status = 'SOLD' 
  AND linked_order_id IS NULL
ORDER BY created_at DESC;

-- 2. Fix the issue - set these items back to AVAILABLE
UPDATE inventory 
SET 
    status = 'AVAILABLE',
    linked_order_id = NULL,
    updated_at = NOW()
WHERE status = 'SOLD' 
  AND linked_order_id IS NULL;

-- 3. Verify the fix
SELECT 
    status,
    COUNT(*) as count
FROM inventory 
GROUP BY status
ORDER BY status;
