-- Script để đồng bộ cấu hình gói sản phẩm
-- Chạy script này để cập nhật các gói sản phẩm thiếu cấu hình

-- Bước 1: Tìm các sản phẩm có shared_inventory_pool = true
WITH shared_products AS (
  SELECT id, name 
  FROM products 
  WHERE shared_inventory_pool = true
),

-- Bước 2: Tìm gói đầu tiên của mỗi sản phẩm (theo created_at)
first_packages AS (
  SELECT 
    p.id as product_id,
    p.name as product_name,
    pk.id as first_package_id,
    pk.code as first_package_code,
    pk.name as first_package_name,
    pk.custom_fields,
    pk.is_account_based,
    pk.account_columns,
    pk.default_slots
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
    fp.first_package_id,
    fp.first_package_code,
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
    fp.default_slots as target_default_slots
  FROM first_packages fp
  JOIN packages pk ON pk.product_id = fp.product_id
  WHERE pk.id != fp.first_package_id
)

-- Bước 4: Hiển thị các gói sẽ được cập nhật (để kiểm tra trước)
SELECT 
  product_name,
  first_package_code as "Gói đầu tiên",
  package_code as "Gói cần cập nhật",
  package_name as "Tên gói",
  CASE 
    WHEN current_custom_fields IS NULL OR current_custom_fields = '[]'::jsonb 
    THEN 'THIẾU' 
    ELSE 'CÓ' 
  END as "Custom Fields",
  CASE 
    WHEN current_account_columns IS NULL OR current_account_columns = '[]'::jsonb 
    THEN 'THIẾU' 
    ELSE 'CÓ' 
  END as "Account Columns",
  CASE 
    WHEN current_is_account_based IS NULL 
    THEN 'THIẾU' 
    ELSE 'CÓ' 
  END as "Account Based"
FROM packages_to_update
ORDER BY product_name, package_code;

-- Bước 5: Thực hiện cập nhật (uncomment để chạy)
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
*/
