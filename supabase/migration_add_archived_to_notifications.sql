-- Add archived_at column to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Create index for archived notifications
CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON notifications(archived_at);

-- Fix RLS policies to use proper UUID comparison
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

-- Recreate policies with proper UUID comparison
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (employee_id::uuid = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (employee_id::uuid = auth.uid());

CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (employee_id::uuid = auth.uid());
