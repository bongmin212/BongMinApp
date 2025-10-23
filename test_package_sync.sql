-- Test script để kiểm tra sync package config
-- Chạy script này để xem trạng thái hiện tại của các gói sản phẩm

-- Kiểm tra các sản phẩm có shared pool
SELECT 
  p.code as "Mã SP",
  p.name as "Tên SP",
  COUNT(pk.id) as "Số gói",
  MIN(pk.created_at) as "Gói đầu tiên",
  MAX(pk.created_at) as "Gói cuối cùng"
FROM products p
JOIN packages pk ON pk.product_id = p.id
WHERE p.shared_inventory_pool = true
GROUP BY p.id, p.code, p.name
ORDER BY p.code;

-- Kiểm tra chi tiết cấu hình của từng gói
WITH first_packages AS (
  SELECT 
    p.id as product_id,
    p.code as product_code,
    p.name as product_name,
    pk.id as first_package_id,
    pk.code as first_package_code,
    pk.custom_fields as first_custom_fields,
    pk.is_account_based as first_is_account_based,
    pk.account_columns as first_account_columns,
    pk.default_slots as first_default_slots
  FROM products p
  JOIN packages pk ON pk.product_id = p.id
  WHERE p.shared_inventory_pool = true
    AND pk.id = (
      SELECT id 
      FROM packages 
      WHERE product_id = p.id 
      ORDER BY created_at ASC 
      LIMIT 1
    )
)
SELECT 
  fp.product_code as "Mã SP",
  fp.product_name as "Tên SP",
  pk.code as "Mã gói",
  pk.name as "Tên gói",
  CASE 
    WHEN pk.id = fp.first_package_id THEN 'GÓI ĐẦU TIÊN'
    WHEN pk.custom_fields IS DISTINCT FROM fp.first_custom_fields THEN 'CẦN SYNC'
    WHEN pk.account_columns IS DISTINCT FROM fp.first_account_columns THEN 'CẦN SYNC'
    WHEN pk.is_account_based IS DISTINCT FROM fp.first_is_account_based THEN 'CẦN SYNC'
    WHEN pk.default_slots IS DISTINCT FROM fp.first_default_slots THEN 'CẦN SYNC'
    ELSE 'OK'
  END as "Trạng thái",
  pk.created_at as "Ngày tạo"
FROM first_packages fp
JOIN packages pk ON pk.product_id = fp.product_id
ORDER BY fp.product_code, pk.created_at;
