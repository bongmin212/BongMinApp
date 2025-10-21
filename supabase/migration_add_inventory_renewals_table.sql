-- Create inventory_renewals table to track warehouse renewals
create table if not exists public.inventory_renewals (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  months int not null,
  amount numeric not null default 0,
  previous_expiry_date timestamptz not null,
  new_expiry_date timestamptz not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

-- Add index for efficient queries
create index if not exists idx_inventory_renewals_inventory_id on public.inventory_renewals (inventory_id);
create index if not exists idx_inventory_renewals_created_at on public.inventory_renewals (created_at);

-- Add RLS policies
alter table public.inventory_renewals enable row level security;

-- Allow all operations for authenticated users
create policy "Allow all operations for authenticated users" on public.inventory_renewals
  for all using (auth.role() = 'authenticated');
