-- ROLLBACK SCRIPT: Đưa database về trạng thái cũ
-- Chạy script này để rollback các thay đổi multi-user

-- 1. Xóa các functions server-side code generation
DROP FUNCTION IF EXISTS generate_order_code();
DROP FUNCTION IF EXISTS generate_inventory_code();
DROP FUNCTION IF EXISTS generate_customer_code();

-- 2. Xóa các functions atomic inventory assignment
DROP FUNCTION IF EXISTS assign_inventory_atomically(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS release_inventory_atomically(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS transfer_inventory_atomically(UUID, UUID, UUID, INTEGER);

-- 3. Xóa các functions server-side notifications
DROP FUNCTION IF EXISTS create_notification_for_order(UUID);
DROP FUNCTION IF EXISTS create_notification_for_inventory(UUID);
DROP FUNCTION IF EXISTS create_notification_for_customer(UUID);

-- 4. Xóa các UNIQUE constraints đã thêm
-- Xóa constraints trên orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS unique_order_code_per_user;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS unique_order_code;

-- Xóa constraints trên inventory  
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS unique_inventory_code_per_user;
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS unique_inventory_code;

-- Xóa constraints trên customers
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS unique_customer_code_per_user;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS unique_customer_code;

-- Xóa constraints trên products
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS unique_product_code_per_user;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS unique_product_code;

-- Xóa constraints trên packages
ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS unique_package_code_per_user;
ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS unique_package_code;

-- 5. Xóa các triggers liên quan
DROP TRIGGER IF EXISTS trigger_generate_order_code ON orders;
DROP TRIGGER IF EXISTS trigger_generate_inventory_code ON inventory;
DROP TRIGGER IF EXISTS trigger_generate_customer_code ON customers;
DROP TRIGGER IF EXISTS trigger_generate_product_code ON products;
DROP TRIGGER IF EXISTS trigger_generate_package_code ON packages;

-- 6. Xóa các policies RLS liên quan đến multi-user
DROP POLICY IF EXISTS "Users can only see their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can only see their own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can only see their own customers" ON public.customers;

-- 7. Xóa các cột đã thêm cho multi-user
-- Xóa cột user_id từ orders
ALTER TABLE public.orders DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS created_by;

-- Xóa cột user_id từ inventory
ALTER TABLE public.inventory DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.inventory DROP COLUMN IF EXISTS created_by;

-- Xóa cột user_id từ customers
ALTER TABLE public.customers DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.customers DROP COLUMN IF EXISTS created_by;

-- 8. Xóa các bảng audit logs
DROP TABLE IF EXISTS security_audit_logs CASCADE;

-- 9. Xóa các views liên quan
DROP VIEW IF EXISTS user_activity_log CASCADE;

-- 10. Xóa các indexes đã thêm
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_inventory_user_id;
DROP INDEX IF EXISTS idx_customers_user_id;
DROP INDEX IF EXISTS idx_orders_created_by;
DROP INDEX IF EXISTS idx_inventory_created_by;
DROP INDEX IF EXISTS idx_customers_created_by;

-- 11. Reset sequences về giá trị ban đầu
-- (Chỉ reset nếu cần thiết)
-- ALTER SEQUENCE orders_id_seq RESTART WITH 1;
-- ALTER SEQUENCE inventory_id_seq RESTART WITH 1;
-- ALTER SEQUENCE customers_id_seq RESTART WITH 1;

-- 12. Xóa các functions audit logging
DROP FUNCTION IF EXISTS log_security_event(text, text, text, text);
DROP FUNCTION IF EXISTS check_suspicious_activity();

-- 13. Xóa các functions cleanup
DROP FUNCTION IF EXISTS cleanup_orphaned_employees();

-- 14. Xóa các triggers auth user delete trước
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP TRIGGER IF EXISTS trigger_handle_auth_user_deleted ON auth.users;

-- 15. Xóa các functions auth user delete
DROP FUNCTION IF EXISTS handle_auth_user_deleted();

COMMIT;
