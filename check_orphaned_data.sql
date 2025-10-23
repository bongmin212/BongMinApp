-- Check for orphaned/redundant data in Supabase
-- Chạy từng query để kiểm tra

-- ===========================================
-- 1. CHECK ORPHANED INVENTORY ITEMS
-- ===========================================

-- Items marked as SOLD but no linked order
SELECT 
    'SOLD without order' as issue_type,
    COUNT(*) as count
FROM inventory 
WHERE status = 'SOLD' 
  AND linked_order_id IS NULL;

-- Items with invalid linked_order_id
SELECT 
    'Invalid linked order' as issue_type,
    COUNT(*) as count
FROM inventory i
LEFT JOIN orders o ON i.linked_order_id = o.id
WHERE i.linked_order_id IS NOT NULL 
  AND o.id IS NULL;

-- ===========================================
-- 2. CHECK ORPHANED ORDERS
-- ===========================================

-- Orders with invalid customer_id
SELECT 
    'Invalid customer' as issue_type,
    COUNT(*) as count
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE c.id IS NULL;

-- Orders with invalid package_id
SELECT 
    'Invalid package' as issue_type,
    COUNT(*) as count
FROM orders o
LEFT JOIN packages p ON o.package_id = p.id
WHERE p.id IS NULL;

-- ===========================================
-- 3. CHECK ORPHANED INVENTORY PROFILES
-- ===========================================

-- Profile slots assigned to non-existent orders
SELECT 
    'Invalid profile assignment' as issue_type,
    COUNT(*) as count
FROM inventory i,
LATERAL jsonb_array_elements(i.profiles) as profile
LEFT JOIN orders o ON (profile->>'assigned_order_id')::uuid = o.id
WHERE profile->>'assigned_order_id' IS NOT NULL 
  AND o.id IS NULL;

-- ===========================================
-- 4. CHECK DUPLICATE NOTIFICATIONS
-- ===========================================

-- Duplicate notifications (same type + related_id + employee_id)
SELECT 
    'Duplicate notifications' as issue_type,
    COUNT(*) - COUNT(DISTINCT (type, related_id, employee_id)) as duplicate_count
FROM notifications
WHERE archived_at IS NULL;

-- ===========================================
-- 5. CHECK ORPHANED WARRANTIES
-- ===========================================

-- Warranties with invalid order_id
SELECT 
    'Invalid warranty order' as issue_type,
    COUNT(*) as count
FROM warranties w
LEFT JOIN orders o ON w.order_id = o.id
WHERE o.id IS NULL;

-- ===========================================
-- 6. CHECK ORPHANED ACTIVITY LOGS
-- ===========================================

-- Activity logs with invalid employee_id
SELECT 
    'Invalid activity log employee' as issue_type,
    COUNT(*) as count
FROM activity_logs al
LEFT JOIN employees e ON al.employee_id = e.id
WHERE e.id IS NULL;

-- ===========================================
-- 7. CHECK ORPHANED EXPENSES
-- ===========================================

-- Expenses with invalid created_by
SELECT 
    'Invalid expense creator' as issue_type,
    COUNT(*) as count
FROM expenses ex
LEFT JOIN employees e ON ex.created_by::uuid = e.id
WHERE e.id IS NULL
  AND ex.created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ===========================================
-- 8. SUMMARY REPORT
-- ===========================================

SELECT 
    'SUMMARY' as report_type,
    'Run individual queries above for detailed counts' as message;
