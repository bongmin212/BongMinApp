-- Migration: Add helper function to check if current user is MANAGER
-- Run this in Supabase SQL editor

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

-- Revoke from anon (should not be accessible to anonymous users)
REVOKE EXECUTE ON FUNCTION public.is_manager() FROM anon;
