-- Add renewal message fields to orders
alter table public.orders
  add column if not exists renewal_message_sent boolean not null default false,
  add column if not exists renewal_message_sent_at timestamptz null,
  add column if not exists renewal_message_sent_by uuid null references public.employees(id) on delete set null;

-- Helpful index to filter expiring-but-not-sent quickly (optional)
create index if not exists idx_orders_renewal_sent_expiry on public.orders (renewal_message_sent, expiry_date);

