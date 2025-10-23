-- Script đồng bộ cấu hình gói sản phẩm cho shared pool
-- Chạy script này khi bạn thêm cột mới vào gói đầu tiên và muốn sync cho các gói khác

-- Bước 1: Kiểm tra các sản phẩm có shared pool và gói cần sync
WITH shared_products AS (
  SELECT id, name, code
  FROM products 
  WHERE shared_inventory_pool = true
),

-- Bước 2: Tìm gói đầu tiên của mỗi sản phẩm (theo created_at)
first_packages AS (
  SELECT 
    p.id as product_id,
    p.name as product_name,
    p.code as product_code,
    pk.id as first_package_id,
    pk.code as first_package_code,
    pk.name as first_package_name,
    pk.custom_fields,
    pk.is_account_based,
    pk.account_columns,
    pk.default_slots,
    pk.created_at
  FROM shared_products p
  JOIN packages pk ON pk.product_id = p.id
  WHERE pk.id = (
    SELECT id 
    FROM packages 
    WHERE product_id = p.id 
    ORDER BY created_at ASC 
    LIMIT 1
  )
),

-- Bước 3: Tìm các gói khác cần cập nhật
packages_to_update AS (
  SELECT 
    fp.product_id,
    fp.product_name,
    fp.product_code,
    fp.first_package_id,
    fp.first_package_code,
    fp.first_package_name,
    pk.id as package_id,
    pk.code as package_code,
    pk.name as package_name,
    pk.custom_fields as current_custom_fields,
    pk.is_account_based as current_is_account_based,
    pk.account_columns as current_account_columns,
    pk.default_slots as current_default_slots,
    fp.custom_fields as target_custom_fields,
    fp.is_account_based as target_is_account_based,
    fp.account_columns as target_account_columns,
    fp.default_slots as target_default_slots,
    pk.created_at
  FROM first_packages fp
  JOIN packages pk ON pk.product_id = fp.product_id
  WHERE pk.id != fp.first_package_id
)

-- Bước 4: Hiển thị preview các gói sẽ được cập nhật
SELECT 
  product_code as "Mã SP",
  product_name as "Tên SP",
  first_package_code as "Gói đầu tiên",
  package_code as "Gói sẽ sync",
  package_name as "Tên gói",
  CASE 
    WHEN current_custom_fields IS DISTINCT FROM target_custom_fields
    THEN 'CẦN SYNC' 
    ELSE 'OK' 
  END as "Custom Fields",
  CASE 
    WHEN current_account_columns IS DISTINCT FROM target_account_columns
    THEN 'CẦN SYNC' 
    ELSE 'OK' 
  END as "Account Columns",
  CASE 
    WHEN current_is_account_based IS DISTINCT FROM target_is_account_based
    THEN 'CẦN SYNC' 
    ELSE 'OK' 
  END as "Account Based",
  CASE 
    WHEN current_default_slots IS DISTINCT FROM target_default_slots
    THEN 'CẦN SYNC' 
    ELSE 'OK' 
  END as "Default Slots",
  created_at as "Ngày tạo"
FROM packages_to_update
ORDER BY product_code, package_code;

-- Bước 5: Thực hiện cập nhật (uncomment để chạy thực tế)
/*
UPDATE packages 
SET 
  custom_fields = first_pk.custom_fields,
  is_account_based = first_pk.is_account_based,
  account_columns = first_pk.account_columns,
  default_slots = first_pk.default_slots,
  updated_at = NOW()
FROM (
  SELECT 
    p.id as product_id,
    pk.id as first_package_id,
    pk.custom_fields,
    pk.is_account_based,
    pk.account_columns,
    pk.default_slots
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
) first_pk
WHERE packages.product_id = first_pk.product_id
  AND packages.id != first_pk.first_package_id;

-- Log hoạt động
INSERT INTO activity_logs (employee_id, action, details, created_at)
SELECT 
  'system',
  'Đồng bộ cấu hình gói sản phẩm',
  'Sync config từ gói đầu tiên cho ' || COUNT(*) || ' gói sản phẩm',
  NOW()
FROM packages_to_update;
*/
