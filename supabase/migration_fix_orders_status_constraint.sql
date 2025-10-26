-- Migration: Fix orders status check constraint to include EXPIRED status
-- This migration updates the existing constraint to allow EXPIRED status

-- Drop the existing constraint
ALTER TABLE public.orders 
DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the updated constraint with EXPIRED status included
ALTER TABLE public.orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN ('PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED'));

-- Add comment for documentation
COMMENT ON COLUMN public.orders.status IS 'Order status: PROCESSING (Đang xử lý), COMPLETED (Hoàn thành), CANCELLED (Đã hủy), EXPIRED (Đã hết hạn)';
