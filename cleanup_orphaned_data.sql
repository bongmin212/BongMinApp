-- Cleanup orphaned/redundant data in Supabase
-- CHẠY TỪNG PHẦN MỘT, KIỂM TRA KẾT QUẢ TRƯỚC KHI CHẠY PHẦN TIẾP THEO

-- ===========================================
-- 1. CLEANUP ORPHANED INVENTORY ITEMS
-- ===========================================

-- Fix inventory items marked as SOLD but no linked order
UPDATE inventory 
SET 
    status = 'AVAILABLE',
    linked_order_id = NULL,
    updated_at = NOW()
WHERE status = 'SOLD' 
  AND linked_order_id IS NULL;

-- Fix inventory items with invalid linked_order_id
UPDATE inventory 
SET 
    status = 'AVAILABLE',
    linked_order_id = NULL,
    updated_at = NOW()
WHERE linked_order_id IS NOT NULL 
  AND linked_order_id NOT IN (SELECT id FROM orders);

-- ===========================================
-- 2. CLEANUP ORPHANED INVENTORY PROFILES
-- ===========================================

-- Fix profile slots assigned to non-existent orders
UPDATE inventory 
SET 
    profiles = (
        SELECT jsonb_agg(
            CASE 
                WHEN profile->>'assigned_order_id' IS NOT NULL 
                     AND (profile->>'assigned_order_id')::uuid NOT IN (SELECT id FROM orders)
                THEN profile - 'assigned_order_id' - 'assigned_at' - 'expiry_at'
                ELSE profile
            END
        )
        FROM jsonb_array_elements(profiles) as profile
    ),
    updated_at = NOW()
WHERE profiles IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(profiles) as profile
    WHERE profile->>'assigned_order_id' IS NOT NULL 
      AND (profile->>'assigned_order_id')::uuid NOT IN (SELECT id FROM orders)
  );

-- ===========================================
-- 3. CLEANUP DUPLICATE NOTIFICATIONS
-- ===========================================

-- Remove duplicate notifications (keep the latest one)
WITH duplicates AS (
  SELECT 
    id,
    type,
    related_id,
    employee_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY type, related_id, employee_id 
      ORDER BY created_at DESC
    ) as rn
  FROM notifications
  WHERE archived_at IS NULL
)
DELETE FROM notifications 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ===========================================
-- 4. CLEANUP ORPHANED WARRANTIES
-- ===========================================

-- Delete warranties with invalid order_id
DELETE FROM warranties 
WHERE order_id NOT IN (SELECT id FROM orders);

-- ===========================================
-- 5. CLEANUP ORPHANED ACTIVITY LOGS
-- ===========================================

-- Delete activity logs with invalid employee_id
DELETE FROM activity_logs 
WHERE employee_id NOT IN (SELECT id FROM employees);

-- ===========================================
-- 6. CLEANUP ORPHANED EXPENSES
-- ===========================================

-- Delete expenses with invalid created_by
DELETE FROM expenses 
WHERE created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND created_by::uuid NOT IN (SELECT id FROM employees);

-- ===========================================
-- 7. VERIFICATION QUERIES
-- ===========================================

-- Check remaining issues after cleanup
SELECT 'Inventory SOLD without order' as check_type, COUNT(*) as count
FROM inventory 
WHERE status = 'SOLD' AND linked_order_id IS NULL

UNION ALL

SELECT 'Invalid inventory linked orders' as check_type, COUNT(*) as count
FROM inventory i
LEFT JOIN orders o ON i.linked_order_id = o.id
WHERE i.linked_order_id IS NOT NULL AND o.id IS NULL

UNION ALL

SELECT 'Invalid order customers' as check_type, COUNT(*) as count
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE c.id IS NULL

UNION ALL

SELECT 'Invalid order packages' as check_type, COUNT(*) as count
FROM orders o
LEFT JOIN packages p ON o.package_id = p.id
WHERE p.id IS NULL

UNION ALL

SELECT 'Duplicate notifications' as check_type, 
       COUNT(*) - COUNT(DISTINCT (type, related_id, employee_id)) as count
FROM notifications
WHERE archived_at IS NULL;
