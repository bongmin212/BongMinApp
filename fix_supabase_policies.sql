-- Fix Supabase RLS Policies Issues
-- Chạy script này trong Supabase SQL Editor

-- ===========================================
-- 1. FIX EXPENSES TABLE - Remove duplicate policies
-- ===========================================

-- Drop conflicting policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.expenses;
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.expenses;

-- Keep only the specific policies (already exist):
-- - expenses_read_all
-- - expenses_insert_all  
-- - expenses_update_all
-- - expenses_delete_manager_only

-- ===========================================
-- 2. FIX INVENTORY_RENEWALS TABLE - Add proper policies
-- ===========================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.inventory_renewals;

-- Add proper role-based policies
CREATE POLICY "inventory_renewals_read_all" ON public.inventory_renewals
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_renewals_insert_all" ON public.inventory_renewals
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_renewals_update_all" ON public.inventory_renewals
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_renewals_delete_manager_only" ON public.inventory_renewals
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- ===========================================
-- 3. FIX NOTIFICATIONS TABLE - Use authenticated role
-- ===========================================

-- Drop existing policies
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

-- Add proper authenticated policies
CREATE POLICY "notifications_read_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR employee_id IS NULL);

CREATE POLICY "notifications_insert_system" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR employee_id IS NULL)
  WITH CHECK (employee_id = auth.uid() OR employee_id IS NULL);

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (employee_id = auth.uid() OR employee_id IS NULL);

-- ===========================================
-- 4. VERIFY POLICIES ARE WORKING
-- ===========================================

-- Check all policies by table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
