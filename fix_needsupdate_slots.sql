-- Fix slots stuck with needsUpdate = true
-- Run this in Supabase SQL Editor

-- First, let's see what we have
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
  END as needsupdate_slots_count
FROM inventory 
WHERE is_account_based = true
  AND status = 'SOLD'
ORDER BY created_at DESC;

-- Fix slots with needsUpdate = true that are not assigned
UPDATE inventory 
SET 
  profiles = (
    SELECT jsonb_agg(
      CASE 
        WHEN (p->>'needsUpdate')::boolean = true AND (p->>'isAssigned')::boolean = false 
        THEN p - 'needsUpdate' - 'previousOrderId'
        ELSE p
      END
    )
    FROM jsonb_array_elements(profiles) p
  ),
  status = CASE 
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(profiles) p 
      WHERE (p->>'isAssigned')::boolean = false 
        AND (p->>'needsUpdate')::boolean IS DISTINCT FROM true
    ) THEN 'AVAILABLE'
    ELSE 'SOLD'
  END,
  updated_at = now()
WHERE is_account_based = true
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(profiles) p 
    WHERE (p->>'needsUpdate')::boolean = true 
      AND (p->>'isAssigned')::boolean = false
  );

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
  END as needsupdate_slots_count
FROM inventory 
WHERE is_account_based = true
ORDER BY created_at DESC
LIMIT 10;
