-- Migration: Fix cleanup_orphaned_employees function permissions and add MANAGER check
-- Run this in Supabase SQL editor

-- Drop existing function
DROP FUNCTION IF EXISTS public.cleanup_orphaned_employees();

-- Recreate function with MANAGER role check
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_employees()
RETURNS TABLE(deleted_count bigint, deleted_employees jsonb) AS $$
DECLARE
  orphaned_employees jsonb;
  count_result bigint;
BEGIN
  -- Security check: Only MANAGER can execute this function
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Access denied: Only MANAGER role can execute this function';
  END IF;

  -- Find orphaned employees
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'code', e.code,
      'username', e.username,
      'role', e.role,
      'created_at', e.created_at
    )
  ), COUNT(*)
  INTO orphaned_employees, count_result
  FROM public.employees e
  LEFT JOIN auth.users u ON e.id = u.id
  WHERE u.id IS NULL;

  -- Delete orphaned employees
  DELETE FROM public.employees 
  WHERE id IN (
    SELECT e.id 
    FROM public.employees e
    LEFT JOIN auth.users u ON e.id = u.id
    WHERE u.id IS NULL
  );

  -- Return results
  RETURN QUERY SELECT count_result, orphaned_employees;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission only to authenticated users (not anon)
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_employees() TO authenticated;

-- Explicitly revoke from anon role
REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_employees() FROM anon;
