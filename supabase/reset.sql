-- WARNING: Dev-only reset. Run in Supabase SQL editor.

-- Drop existing objects (ignore errors)
drop table if exists public.activity_logs cascade;
drop table if exists public.expenses cascade;
drop table if exists public.warranties cascade;
drop table if exists public.inventory cascade;
drop table if exists public.orders cascade;
drop table if exists public.packages cascade;
drop table if exists public.products cascade;
drop table if exists public.customers cascade;
drop table if exists public.employees cascade;

-- Base tables
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  username text unique not null,
  role text not null default 'EMPLOYEE',
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type text not null default 'RETAIL',
  phone text,
  email text,
  source text,
  source_detail text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  shared_inventory_pool boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  warranty_period int not null default 0,
  cost_price numeric not null default 0,
  ctv_price numeric not null default 0,
  retail_price numeric not null default 0,
  custom_fields jsonb,
  is_account_based boolean default false,
  default_slots int,
  account_columns jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  product_id uuid not null references public.products(id) on delete cascade,
  package_id uuid references public.packages(id) on delete set null,
  purchase_date timestamptz not null,
  expiry_date timestamptz,
  source_note text,
  purchase_price numeric,
  product_info text,
  notes text,
  status text not null default 'AVAILABLE',
  is_account_based boolean default false,
  account_columns jsonb,
  account_data jsonb,
  total_slots int,
  profiles jsonb,
  linked_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  inventory_item_id uuid references public.inventory(id) on delete set null,
  purchase_date timestamptz not null,
  order_info text,
  status text default 'PROCESSING',
  payment_status text default 'UNPAID',
  expiry_date timestamptz,
  renewals jsonb,
  notes text,
  created_by text,
  use_custom_price boolean default false,
  custom_price numeric default 0,
  custom_field_values jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  order_id uuid references public.orders(id) on delete cascade,
  -- denormalized pointers (optional, for faster filtering/display)
  customer_id uuid references public.customers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  -- warranty details (match UI form)
  reason text,
  status text not null default 'PENDING',
  replacement_inventory_id uuid references public.inventory(id) on delete set null,
  new_order_info text,
  created_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_warranties_order on public.warranties(order_id);
create index if not exists idx_warranties_customer on public.warranties(customer_id);
create index if not exists idx_warranties_status on public.warranties(status);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  action text not null,
  details text,
  timestamp timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  amount numeric not null,
  category text,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.employees enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.packages enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.warranties enable row level security;
alter table public.activity_logs enable row level security;
alter table public.expenses enable row level security;

-- Dev policies (relax for anon key; tighten in prod)
create policy "dev full access" on public.employees for all using (true) with check (true);
create policy "dev full access" on public.customers for all using (true) with check (true);
create policy "dev full access" on public.products for all using (true) with check (true);
create policy "dev full access" on public.packages for all using (true) with check (true);
create policy "dev full access" on public.inventory for all using (true) with check (true);
create policy "dev full access" on public.orders for all using (true) with check (true);
create policy "dev full access" on public.warranties for all using (true) with check (true);
create policy "dev full access" on public.activity_logs for all using (true) with check (true);
create policy "dev full access" on public.expenses for all using (true) with check (true);

-- Realtime: Supabase Realtime picks up changes automatically for tables in public schema

-- Helpful indexes
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_packages_product on public.packages(product_id);
create index if not exists idx_inventory_package on public.inventory(package_id);


