-- Add payment status field to inventory table
-- Track whether inventory items have been paid to suppliers

-- Add payment_status column to inventory table
alter table if exists public.inventory
  add column if not exists payment_status text default 'UNPAID';

-- Add constraint to ensure only valid payment status values
-- First drop constraint if it exists, then add it
do $$
begin
  if exists (select 1 from information_schema.table_constraints 
             where constraint_name = 'inventory_payment_status_check' 
             and table_name = 'inventory') then
    alter table public.inventory drop constraint inventory_payment_status_check;
  end if;
end $$;

alter table public.inventory
  add constraint inventory_payment_status_check 
  check (payment_status in ('UNPAID', 'PAID'));

-- Update existing records to have default payment status
update public.inventory 
set payment_status = 'UNPAID' 
where payment_status is null;
