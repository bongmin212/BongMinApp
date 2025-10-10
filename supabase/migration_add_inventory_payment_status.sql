-- Add payment status field to inventory table
-- Track whether inventory items have been paid to suppliers

-- Add payment_status column to inventory table
alter table if exists public.inventory
  add column if not exists payment_status text default 'UNPAID';

-- Add constraint to ensure only valid payment status values
alter table if exists public.inventory
  add constraint if not exists inventory_payment_status_check 
  check (payment_status in ('UNPAID', 'PAID'));

-- Update existing records to have default payment status
update public.inventory 
set payment_status = 'UNPAID' 
where payment_status is null;
