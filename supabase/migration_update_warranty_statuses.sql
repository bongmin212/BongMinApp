-- Update warranty statuses from DONE to FIXED
-- This migration updates existing warranties and adds constraints for new status values

-- Update existing warranties with status 'DONE' to 'FIXED'
UPDATE public.warranties 
SET status = 'FIXED' 
WHERE status = 'DONE';

-- Add constraint to ensure only valid warranty statuses
ALTER TABLE public.warranties 
ADD CONSTRAINT check_warranty_status 
CHECK (status IN ('PENDING', 'FIXED', 'REPLACED'));

-- Add comment for documentation
COMMENT ON COLUMN public.warranties.status IS 'Warranty status: PENDING (Chưa xong), FIXED (Đã fix), REPLACED (Đã đổi bảo hành)';
