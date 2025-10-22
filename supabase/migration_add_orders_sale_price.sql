-- Add sale_price snapshot to orders
alter table public.orders
  add column if not exists sale_price numeric;

-- Note: We intentionally set this from the application layer.
-- Legacy rows may remain null until optionally backfilled.


