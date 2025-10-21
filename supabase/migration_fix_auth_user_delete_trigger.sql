-- Migration: Clean up old auth user delete trigger and function
-- Run this in Supabase SQL editor

-- Step 1: Drop the old trigger first
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

-- Step 2: Drop the old function
DROP FUNCTION IF EXISTS public.handle_delete_auth_user();

-- Step 3: Create new function
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete employee record when auth user is deleted
  DELETE FROM public.employees WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create new trigger
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- Step 5: Grant necessary permissions
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT SELECT ON auth.users TO postgres;
