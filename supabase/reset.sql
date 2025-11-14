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
  inventory_profile_id text, -- for account-based inventory slot id
  purchase_date timestamptz not null,
  status text default 'PROCESSING',
  payment_status text default 'UNPAID',
  expiry_date timestamptz,
  renewals jsonb,
  notes text,
  created_by text,
  use_custom_price boolean default false,
  custom_price numeric default 0,
  custom_field_values jsonb,
  -- renewal notification flags
  renewal_message_sent boolean not null default false,
  renewal_message_sent_at timestamptz,
  renewal_message_sent_by uuid references public.employees(id) on delete set null,
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
  type text not null,
  amount numeric not null,
  description text,
  date timestamptz not null,
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

-- Helper function to check if current authenticated user has MANAGER role
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean AS $$
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user exists in employees table and has MANAGER role
  RETURN EXISTS (
    SELECT 1 
    FROM public.employees 
    WHERE id = auth.uid() 
    AND role = 'MANAGER'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users only
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

-- EMPLOYEES TABLE POLICIES
-- Read: All authenticated users can read employees (for dropdowns, etc.)
CREATE POLICY "employees_read_all" ON public.employees
  FOR SELECT TO authenticated
  USING (true);

-- Insert: Only MANAGER can create new employees
CREATE POLICY "employees_insert_manager_only" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());

-- Update: Users can update their own record, MANAGER can update any
CREATE POLICY "employees_update_self_or_manager" ON public.employees
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_manager())
  WITH CHECK (id = auth.uid() OR public.is_manager());

-- Delete: Only MANAGER can delete employees
CREATE POLICY "employees_delete_manager_only" ON public.employees
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- CUSTOMERS TABLE POLICIES
-- Read: All authenticated users can read customers
CREATE POLICY "customers_read_all" ON public.customers
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create customers
CREATE POLICY "customers_insert_all" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update customers
CREATE POLICY "customers_update_all" ON public.customers
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete customers
CREATE POLICY "customers_delete_manager_only" ON public.customers
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- PRODUCTS TABLE POLICIES
-- Read: All authenticated users can read products
CREATE POLICY "products_read_all" ON public.products
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create products
CREATE POLICY "products_insert_all" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update products
CREATE POLICY "products_update_all" ON public.products
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete products
CREATE POLICY "products_delete_manager_only" ON public.products
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- PACKAGES TABLE POLICIES
-- Read: All authenticated users can read packages
CREATE POLICY "packages_read_all" ON public.packages
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create packages
CREATE POLICY "packages_insert_all" ON public.packages
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update packages
CREATE POLICY "packages_update_all" ON public.packages
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete packages
CREATE POLICY "packages_delete_manager_only" ON public.packages
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- INVENTORY TABLE POLICIES
-- Read: All authenticated users can read inventory
CREATE POLICY "inventory_read_all" ON public.inventory
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create inventory
CREATE POLICY "inventory_insert_all" ON public.inventory
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update inventory
CREATE POLICY "inventory_update_all" ON public.inventory
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete inventory
CREATE POLICY "inventory_delete_manager_only" ON public.inventory
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- ORDERS TABLE POLICIES
-- Read: All authenticated users can read orders
CREATE POLICY "orders_read_all" ON public.orders
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create orders
CREATE POLICY "orders_insert_all" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update orders
CREATE POLICY "orders_update_all" ON public.orders
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete orders
CREATE POLICY "orders_delete_manager_only" ON public.orders
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- WARRANTIES TABLE POLICIES
-- Read: All authenticated users can read warranties
CREATE POLICY "warranties_read_all" ON public.warranties
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create warranties
CREATE POLICY "warranties_insert_all" ON public.warranties
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update warranties
CREATE POLICY "warranties_update_all" ON public.warranties
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete warranties
CREATE POLICY "warranties_delete_manager_only" ON public.warranties
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- EXPENSES TABLE POLICIES
-- Read: All authenticated users can read expenses
CREATE POLICY "expenses_read_all" ON public.expenses
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create expenses
CREATE POLICY "expenses_insert_all" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: All authenticated users can update expenses
CREATE POLICY "expenses_update_all" ON public.expenses
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Only MANAGER can delete expenses
CREATE POLICY "expenses_delete_manager_only" ON public.expenses
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- ACTIVITY_LOGS TABLE POLICIES
-- Read: All authenticated users can read activity logs
CREATE POLICY "activity_logs_read_all" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (true);

-- Insert: All authenticated users can create activity logs
CREATE POLICY "activity_logs_insert_all" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: Only MANAGER can update activity logs (for corrections)
CREATE POLICY "activity_logs_update_manager_only" ON public.activity_logs
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- Delete: Only MANAGER can delete activity logs
CREATE POLICY "activity_logs_delete_manager_only" ON public.activity_logs
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- Realtime: Supabase Realtime picks up changes automatically for tables in public schema

-- Helpful indexes
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_renewal_sent_expiry on public.orders (renewal_message_sent, expiry_date);
create index if not exists idx_packages_product on public.packages(product_id);
create index if not exists idx_inventory_package on public.inventory(package_id);


