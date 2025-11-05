-- Add refund tracking columns to orders
-- Safe to run multiple times: checks for column existence where supported

alter table if exists public.orders
  add column if not exists refund_amount numeric default 0 not null;

alter table if exists public.orders
  add column if not exists refund_at timestamptz null;

-- Optional: index by refund time for monthly aggregations
create index if not exists idx_orders_refund_at on public.orders (refund_at);


-- Ensure orders.payment_status accepts REFUNDED
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'orders_payment_status_check' 
      and table_name = 'orders' 
      and table_schema = 'public'
  ) then
    alter table public.orders drop constraint orders_payment_status_check;
  end if;
end $$;

alter table public.orders
  add constraint orders_payment_status_check 
  check (payment_status in ('UNPAID', 'PAID', 'REFUNDED'));

-- Optional: normalize any legacy/invalid values
update public.orders
set payment_status = 'UNPAID'
where payment_status is null or payment_status not in ('UNPAID', 'PAID', 'REFUNDED');

