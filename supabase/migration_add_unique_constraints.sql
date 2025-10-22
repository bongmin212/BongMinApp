-- Migration: Add UNIQUE constraints and optimistic locking fields
-- Run this in Supabase SQL editor

-- Add version fields for optimistic locking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE public.warranties ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- Add UNIQUE constraints on code columns
ALTER TABLE public.orders ADD CONSTRAINT orders_code_unique UNIQUE (code);
ALTER TABLE public.customers ADD CONSTRAINT customers_code_unique UNIQUE (code);
ALTER TABLE public.products ADD CONSTRAINT products_code_unique UNIQUE (code);
ALTER TABLE public.packages ADD CONSTRAINT packages_code_unique UNIQUE (code);
ALTER TABLE public.inventory ADD CONSTRAINT inventory_code_unique UNIQUE (code);
ALTER TABLE public.warranties ADD CONSTRAINT warranties_code_unique UNIQUE (code);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_code_unique UNIQUE (code);

-- Add CHECK constraints for valid status transitions
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('PROCESSING', 'COMPLETED', 'CANCELLED'));

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
  CHECK (payment_status IN ('UNPAID', 'PAID', 'PARTIAL'));

ALTER TABLE public.inventory ADD CONSTRAINT inventory_status_check 
  CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD'));

ALTER TABLE public.customers ADD CONSTRAINT customers_type_check 
  CHECK (type IN ('CTV', 'RETAIL'));

-- Add indexes for better performance on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_orders_code ON public.orders (code);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);

CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers (code);
CREATE INDEX IF NOT EXISTS idx_customers_type ON public.customers (type);

CREATE INDEX IF NOT EXISTS idx_products_code ON public.products (code);
CREATE INDEX IF NOT EXISTS idx_packages_code ON public.packages (code);
CREATE INDEX IF NOT EXISTS idx_packages_product_id ON public.packages (product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_code ON public.inventory (code);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory (status);
CREATE INDEX IF NOT EXISTS idx_inventory_package_id ON public.inventory (package_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_linked_order_id ON public.inventory (linked_order_id);

CREATE INDEX IF NOT EXISTS idx_warranties_code ON public.warranties (code);
CREATE INDEX IF NOT EXISTS idx_warranties_order_id ON public.warranties (order_id);

CREATE INDEX IF NOT EXISTS idx_expenses_code ON public.expenses (code);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses (date);

-- Add function to increment version on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-increment version on updates
CREATE TRIGGER orders_version_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER customers_version_trigger
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER products_version_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER packages_version_trigger
  BEFORE UPDATE ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER inventory_version_trigger
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER warranties_version_trigger
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER expenses_version_trigger
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();
