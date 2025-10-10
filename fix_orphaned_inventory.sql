-- Script để fix các slot kho hàng không có đơn liên kết nhưng vẫn hiển thị đã bán
-- Chạy script này để giải phóng các slot bị "mắc kẹt" trong trạng thái SOLD

-- 1. Tìm và liệt kê các slot có vấn đề
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
  AND (linked_order_id IS NULL OR linked_order_id = '')
ORDER BY created_at DESC;

-- 2. Kiểm tra xem các đơn hàng liên kết có còn tồn tại không
SELECT 
    i.id as inventory_id,
    i.code,
    i.linked_order_id,
    o.id as order_exists,
    o.code as order_code
FROM inventory i
LEFT JOIN orders o ON i.linked_order_id = o.id
WHERE i.status = 'SOLD' 
  AND i.linked_order_id IS NOT NULL 
  AND i.linked_order_id != ''
ORDER BY i.created_at DESC;

-- 3. Fix các slot bị orphaned (không có đơn liên kết hợp lệ)
UPDATE inventory 
SET 
    status = 'AVAILABLE',
    linked_order_id = NULL
WHERE status = 'SOLD' 
  AND (
    linked_order_id IS NULL 
    OR linked_order_id = ''
    OR linked_order_id NOT IN (SELECT id FROM orders)
  );

-- 4. Kiểm tra kết quả sau khi fix
SELECT 
    status,
    COUNT(*) as count
FROM inventory 
GROUP BY status
ORDER BY status;
