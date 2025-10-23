-- Clean up duplicate notifications in database
-- This script removes duplicate notifications based on type + related_id + employee_id

WITH duplicates AS (
  SELECT 
    id,
    type,
    related_id,
    employee_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY type, related_id, employee_id 
      ORDER BY created_at DESC
    ) as rn
  FROM notifications
  WHERE archived_at IS NULL  -- Only clean active notifications
)
DELETE FROM notifications 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Show remaining notifications count
SELECT 
  employee_id,
  type,
  COUNT(*) as count
FROM notifications 
WHERE archived_at IS NULL
GROUP BY employee_id, type
ORDER BY employee_id, type;


