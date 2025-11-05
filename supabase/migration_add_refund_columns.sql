-- Add refund tracking columns to orders
-- Safe to run multiple times: checks for column existence where supported

alter table if exists public.orders
  add column if not exists refund_amount numeric default 0 not null;

alter table if exists public.orders
  add column if not exists refund_at timestamptz null;

-- Optional: index by refund time for monthly aggregations
create index if not exists idx_orders_refund_at on public.orders (refund_at);


