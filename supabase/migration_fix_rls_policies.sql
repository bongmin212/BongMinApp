-- Migration: Fix RLS policies with proper role-based access control
-- Run this in Supabase SQL editor

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "dev full access" ON public.employees;
DROP POLICY IF EXISTS "dev full access" ON public.customers;
DROP POLICY IF EXISTS "dev full access" ON public.products;
DROP POLICY IF EXISTS "dev full access" ON public.packages;
DROP POLICY IF EXISTS "dev full access" ON public.inventory;
DROP POLICY IF EXISTS "dev full access" ON public.orders;
DROP POLICY IF EXISTS "dev full access" ON public.warranties;
DROP POLICY IF EXISTS "dev full access" ON public.activity_logs;
DROP POLICY IF EXISTS "dev full access" ON public.expenses;

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
