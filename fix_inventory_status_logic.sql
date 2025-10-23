-- Comprehensive fix for inventory status logic
-- Run this in Supabase SQL Editor

-- First, let's see the current state
SELECT 
  id,
  code,
  status,
  is_account_based,
  profiles,
  CASE 
    WHEN is_account_based THEN 
      (SELECT COUNT(*) FROM jsonb_array_elements(profiles) p WHERE (p->>'isAssigned')::boolean = true)
    ELSE 0
  END as assigned_slots_count,
  CASE 
    WHEN is_account_based THEN 
      (SELECT COUNT(*) FROM jsonb_array_elements(profiles) p WHERE (p->>'needsUpdate')::boolean = true)
    ELSE 0
  END as needsupdate_slots_count,
  CASE 
    WHEN is_account_based THEN 
      (SELECT COUNT(*) FROM jsonb_array_elements(profiles) p WHERE (p->>'isAssigned')::boolean = false AND (p->>'needsUpdate')::boolean IS DISTINCT FROM true)
    ELSE 0
  END as free_slots_count
FROM inventory 
WHERE is_account_based = true
ORDER BY created_at DESC;

-- Fix inventory status based on actual slot assignments
UPDATE inventory 
SET 
  status = CASE 
    WHEN is_account_based THEN
      CASE 
        -- If no profiles array or empty, mark as AVAILABLE
        WHEN profiles IS NULL OR jsonb_array_length(profiles) = 0 THEN 'AVAILABLE'
        -- If all slots are assigned, mark as SOLD
        WHEN NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(profiles) p 
          WHERE (p->>'isAssigned')::boolean = false 
            AND (p->>'needsUpdate')::boolean IS DISTINCT FROM true
        ) THEN 'SOLD'
        -- If there are free slots, mark as AVAILABLE
        ELSE 'AVAILABLE'
      END
    ELSE status -- Keep non-account-based status as is
  END,
  updated_at = now()
WHERE is_account_based = true;

-- Show results after fix
SELECT 
  id,
  code,
  status,
  is_account_based,
  CASE 
    WHEN is_account_based THEN 
      (SELECT COUNT(*) FROM jsonb_array_elements(profiles) p WHERE (p->>'isAssigned')::boolean = true)
    ELSE 0
  END as assigned_slots_count,
  CASE 
    WHEN is_account_based THEN 
      (SELECT COUNT(*) FROM jsonb_array_elements(profiles) p WHERE (p->>'needsUpdate')::boolean = true)
    ELSE 0
  END as needsupdate_slots_count,
  CASE 
    WHEN is_account_based THEN 
      (SELECT COUNT(*) FROM jsonb_array_elements(profiles) p WHERE (p->>'isAssigned')::boolean = false AND (p->>'needsUpdate')::boolean IS DISTINCT FROM true)
    ELSE 0
  END as free_slots_count
FROM inventory 
WHERE is_account_based = true
ORDER BY created_at DESC
LIMIT 10;
