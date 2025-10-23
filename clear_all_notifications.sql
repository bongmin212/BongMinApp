-- Clear all notifications from database
-- WARNING: This will delete ALL notifications for ALL users

-- First, show current count
SELECT 
  COUNT(*) as total_notifications,
  COUNT(CASE WHEN archived_at IS NULL THEN 1 END) as active_notifications,
  COUNT(CASE WHEN archived_at IS NOT NULL THEN 1 END) as archived_notifications
FROM notifications;

-- Delete all notifications
DELETE FROM notifications;

-- Verify deletion
SELECT COUNT(*) as remaining_notifications FROM notifications;
