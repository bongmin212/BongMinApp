-- Migration: Server-side code generation functions and triggers
-- Run this in Supabase SQL editor

-- Create sequences for each entity type
CREATE SEQUENCE IF NOT EXISTS orders_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS customers_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS products_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS packages_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inventory_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS warranties_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS expenses_code_seq START 1;

-- Function to generate next order code
CREATE OR REPLACE FUNCTION generate_next_order_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique order code after % attempts', max_attempts;
    END IF;
    
    -- Get next sequence value
    next_num := nextval('orders_code_seq');
    
    -- Format as DH0001, DH0002, etc.
    code := 'DH' || lpad(next_num::TEXT, 4, '0');
    
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE orders.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next customer code
CREATE OR REPLACE FUNCTION generate_next_customer_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique customer code after % attempts', max_attempts;
    END IF;
    
    next_num := nextval('customers_code_seq');
    code := 'KH' || lpad(next_num::TEXT, 3, '0');
    
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE customers.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next product code
CREATE OR REPLACE FUNCTION generate_next_product_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique product code after % attempts', max_attempts;
    END IF;
    
    next_num := nextval('products_code_seq');
    code := 'SP' || lpad(next_num::TEXT, 3, '0');
    
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE products.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next package code
CREATE OR REPLACE FUNCTION generate_next_package_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique package code after % attempts', max_attempts;
    END IF;
    
    next_num := nextval('packages_code_seq');
    code := 'PK' || lpad(next_num::TEXT, 3, '0');
    
    IF NOT EXISTS (SELECT 1 FROM public.packages WHERE packages.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next inventory code
CREATE OR REPLACE FUNCTION generate_next_inventory_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique inventory code after % attempts', max_attempts;
    END IF;
    
    next_num := nextval('inventory_code_seq');
    code := 'KHO' || lpad(next_num::TEXT, 3, '0');
    
    IF NOT EXISTS (SELECT 1 FROM public.inventory WHERE inventory.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next warranty code
CREATE OR REPLACE FUNCTION generate_next_warranty_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique warranty code after % attempts', max_attempts;
    END IF;
    
    next_num := nextval('warranties_code_seq');
    code := 'BH' || lpad(next_num::TEXT, 3, '0');
    
    IF NOT EXISTS (SELECT 1 FROM public.warranties WHERE warranties.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate next expense code
CREATE OR REPLACE FUNCTION generate_next_expense_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique expense code after % attempts', max_attempts;
    END IF;
    
    next_num := nextval('expenses_code_seq');
    code := 'CP' || lpad(next_num::TEXT, 3, '0');
    
    IF NOT EXISTS (SELECT 1 FROM public.expenses WHERE expenses.code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-populate codes on INSERT if null/empty
CREATE OR REPLACE FUNCTION auto_generate_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate if code is null or empty
  IF NEW.code IS NULL OR TRIM(NEW.code) = '' THEN
    CASE TG_TABLE_NAME
      WHEN 'orders' THEN
        NEW.code := generate_next_order_code();
      WHEN 'customers' THEN
        NEW.code := generate_next_customer_code();
      WHEN 'products' THEN
        NEW.code := generate_next_product_code();
      WHEN 'packages' THEN
        NEW.code := generate_next_package_code();
      WHEN 'inventory' THEN
        NEW.code := generate_next_inventory_code();
      WHEN 'warranties' THEN
        NEW.code := generate_next_warranty_code();
      WHEN 'expenses' THEN
        NEW.code := generate_next_expense_code();
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for each table
CREATE TRIGGER orders_auto_code_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

CREATE TRIGGER customers_auto_code_trigger
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

CREATE TRIGGER products_auto_code_trigger
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

CREATE TRIGGER packages_auto_code_trigger
  BEFORE INSERT ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

CREATE TRIGGER inventory_auto_code_trigger
  BEFORE INSERT ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

CREATE TRIGGER warranties_auto_code_trigger
  BEFORE INSERT ON public.warranties
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

CREATE TRIGGER expenses_auto_code_trigger
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_code();

-- Initialize sequences with existing data
-- This ensures sequences start after the highest existing code number
DO $$
DECLARE
  max_order_num INTEGER;
  max_customer_num INTEGER;
  max_product_num INTEGER;
  max_package_num INTEGER;
  max_inventory_num INTEGER;
  max_warranty_num INTEGER;
  max_expense_num INTEGER;
BEGIN
  -- Get max order number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)
  INTO max_order_num
  FROM public.orders
  WHERE code ~ '^DH[0-9]+$';
  
  -- Get max customer number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)
  INTO max_customer_num
  FROM public.customers
  WHERE code ~ '^KH[0-9]+$';
  
  -- Get max product number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)
  INTO max_product_num
  FROM public.products
  WHERE code ~ '^SP[0-9]+$';
  
  -- Get max package number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)
  INTO max_package_num
  FROM public.packages
  WHERE code ~ '^PK[0-9]+$';
  
  -- Get max inventory number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 0)
  INTO max_inventory_num
  FROM public.inventory
  WHERE code ~ '^KHO[0-9]+$';
  
  -- Get max warranty number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)
  INTO max_warranty_num
  FROM public.warranties
  WHERE code ~ '^BH[0-9]+$';
  
  -- Get max expense number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0)
  INTO max_expense_num
  FROM public.expenses
  WHERE code ~ '^CP[0-9]+$';
  
  -- Set sequences to start after max existing number
  PERFORM setval('orders_code_seq', GREATEST(max_order_num, 1));
  PERFORM setval('customers_code_seq', GREATEST(max_customer_num, 1));
  PERFORM setval('products_code_seq', GREATEST(max_product_num, 1));
  PERFORM setval('packages_code_seq', GREATEST(max_package_num, 1));
  PERFORM setval('inventory_code_seq', GREATEST(max_inventory_num, 1));
  PERFORM setval('warranties_code_seq', GREATEST(max_warranty_num, 1));
  PERFORM setval('expenses_code_seq', GREATEST(max_expense_num, 1));
END $$;
