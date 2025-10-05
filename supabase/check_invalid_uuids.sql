-- Check for invalid UUIDs in all tables
-- Run this in Supabase SQL editor

-- Check for records that might have non-UUID IDs by looking at length
-- Valid UUIDs should be 36 characters long (with hyphens)
SELECT 'customers' as table_name, id, code, name FROM customers WHERE length(id::text) != 36
UNION ALL
SELECT 'packages' as table_name, id, code, name FROM packages WHERE length(id::text) != 36
UNION ALL  
SELECT 'inventory' as table_name, id, code, '' as name FROM inventory WHERE length(id::text) != 36
UNION ALL
SELECT 'products' as table_name, id, code, name FROM products WHERE length(id::text) != 36
UNION ALL
SELECT 'orders' as table_name, id, code, '' as name FROM orders WHERE length(id::text) != 36;

-- Alternative: Check for specific problematic ID
SELECT 'customers' as table_name, id, code, name FROM customers WHERE id::text = 'mgd6mnadoih0vwjmtig'
UNION ALL
SELECT 'packages' as table_name, id, code, name FROM packages WHERE id::text = 'mgd6mnadoih0vwjmtig'
UNION ALL
SELECT 'inventory' as table_name, id, code, '' as name FROM inventory WHERE id::text = 'mgd6mnadoih0vwjmtig'
UNION ALL
SELECT 'products' as table_name, id, code, name FROM products WHERE id::text = 'mgd6mnadoih0vwjmtig'
UNION ALL
SELECT 'orders' as table_name, id, code, '' as name FROM orders WHERE id::text = 'mgd6mnadoih0vwjmtig';
