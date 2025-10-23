-- Fix stuck inventory items (status = SOLD but no assigned slots)
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
  END as assigned_slots_count
FROM inventory 
WHERE status = 'SOLD' 
  AND is_account_based = true
ORDER BY created_at DESC;

-- Fix stuck inventory items
UPDATE inventory 
SET 
  status = 'AVAILABLE',
  updated_at = now()
WHERE status = 'SOLD' 
  AND is_account_based = true
  AND NOT EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(profiles) p 
    WHERE (p->>'isAssigned')::boolean = true
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
  END as assigned_slots_count
FROM inventory 
WHERE is_account_based = true
ORDER BY created_at DESC
LIMIT 10;
