-- Migration: Server-side notification generation
-- Run this in Supabase SQL editor

-- Create function to generate notifications for a specific user
CREATE OR REPLACE FUNCTION generate_user_notifications(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  type TEXT,
  title TEXT,
  message TEXT,
  priority TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ,
  related_id TEXT,
  action_url TEXT,
  employee_id UUID
) AS $$
DECLARE
  notification_record RECORD;
  expiry_warning_days INTEGER := 7;
  current_time TIMESTAMPTZ := NOW();
BEGIN
  -- Clear existing notifications for this user first
  DELETE FROM public.notifications WHERE employee_id = p_user_id;
  
  -- 1. Expiry warnings for orders
  FOR notification_record IN
    SELECT 
      o.id as order_id,
      o.code as order_code,
      o.expiry_date,
      c.name as customer_name,
      p.name as package_name
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    JOIN public.packages p ON p.id = o.package_id
    WHERE o.status = 'COMPLETED'
      AND o.expiry_date IS NOT NULL
      AND o.expiry_date <= (current_time + INTERVAL '1 day' * expiry_warning_days)
      AND o.expiry_date > current_time
  LOOP
    INSERT INTO public.notifications (
      type, title, message, priority, is_read, created_at, 
      related_id, action_url, employee_id
    ) VALUES (
      'expiry_warning',
      'Cảnh báo hết hạn đơn hàng',
      'Đơn hàng ' || notification_record.order_code || ' (' || notification_record.customer_name || ') sẽ hết hạn vào ' || 
      TO_CHAR(notification_record.expiry_date, 'DD/MM/YYYY') || '. Gói: ' || notification_record.package_name,
      'high',
      false,
      current_time,
      notification_record.order_id::TEXT,
      '/orders?tab=orders',
      p_user_id
    );
  END LOOP;
  
  -- 2. Payment reminders for unpaid orders
  FOR notification_record IN
    SELECT 
      o.id as order_id,
      o.code as order_code,
      c.name as customer_name,
      o.purchase_date,
      p.name as package_name
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    JOIN public.packages p ON p.id = o.package_id
    WHERE o.payment_status = 'UNPAID'
      AND o.status = 'COMPLETED'
      AND o.purchase_date <= (current_time - INTERVAL '1 day')
  LOOP
    INSERT INTO public.notifications (
      type, title, message, priority, is_read, created_at, 
      related_id, action_url, employee_id
    ) VALUES (
      'payment_reminder',
      'Nhắc nhở thanh toán',
      'Đơn hàng ' || notification_record.order_code || ' (' || notification_record.customer_name || ') chưa thanh toán. Gói: ' || notification_record.package_name,
      'medium',
      false,
      current_time,
      notification_record.order_id::TEXT,
      '/orders?tab=orders',
      p_user_id
    );
  END LOOP;
  
  -- 3. Processing orders (orders that have been processing for more than 1 day)
  FOR notification_record IN
    SELECT 
      o.id as order_id,
      o.code as order_code,
      c.name as customer_name,
      o.purchase_date,
      p.name as package_name
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    JOIN public.packages p ON p.id = o.package_id
    WHERE o.status = 'PROCESSING'
      AND o.purchase_date <= (current_time - INTERVAL '1 day')
  LOOP
    INSERT INTO public.notifications (
      type, title, message, priority, is_read, created_at, 
      related_id, action_url, employee_id
    ) VALUES (
      'processing_reminder',
      'Nhắc nhở xử lý đơn hàng',
      'Đơn hàng ' || notification_record.order_code || ' (' || notification_record.customer_name || ') đang xử lý quá lâu. Gói: ' || notification_record.package_name,
      'medium',
      false,
      current_time,
      notification_record.order_id::TEXT,
      '/orders?tab=orders',
      p_user_id
    );
  END LOOP;
  
  -- 4. Profile needs update (for account-based inventory)
  FOR notification_record IN
    SELECT 
      i.id as inventory_id,
      i.code as inventory_code,
      p.name as package_name,
      pr.name as product_name
    FROM public.inventory i
    JOIN public.packages p ON p.id = i.package_id
    JOIN public.products pr ON pr.id = i.product_id
    WHERE i.is_account_based = true
      AND i.profiles IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(i.profiles) AS profile
        WHERE (profile->>'needsUpdate')::BOOLEAN = true
      )
  LOOP
    INSERT INTO public.notifications (
      type, title, message, priority, is_read, created_at, 
      related_id, action_url, employee_id
    ) VALUES (
      'profile_update_needed',
      'Cần cập nhật profile',
      'Kho hàng ' || notification_record.inventory_code || ' (' || notification_record.product_name || ' - ' || notification_record.package_name || ') có profile cần cập nhật',
      'medium',
      false,
      current_time,
      notification_record.inventory_id::TEXT,
      '/products?tab=warehouse',
      p_user_id
    );
  END LOOP;
  
  -- 5. New warranties (warranties created in the last 24 hours)
  FOR notification_record IN
    SELECT 
      w.id as warranty_id,
      w.code as warranty_code,
      o.code as order_code,
      c.name as customer_name,
      p.name as package_name
    FROM public.warranties w
    JOIN public.orders o ON o.id = w.order_id
    JOIN public.customers c ON c.id = o.customer_id
    JOIN public.packages p ON p.id = o.package_id
    WHERE w.created_at >= (current_time - INTERVAL '24 hours')
  LOOP
    INSERT INTO public.notifications (
      type, title, message, priority, is_read, created_at, 
      related_id, action_url, employee_id
    ) VALUES (
      'new_warranty',
      'Bảo hành mới',
      'Tạo bảo hành ' || notification_record.warranty_code || ' cho đơn hàng ' || notification_record.order_code || ' (' || notification_record.customer_name || '). Gói: ' || notification_record.package_name,
      'low',
      false,
      current_time,
      notification_record.warranty_id::TEXT,
      '/orders?tab=warranties',
      p_user_id
    );
  END LOOP;
  
  -- Return all notifications for this user
  RETURN QUERY
  SELECT 
    n.id,
    n.type,
    n.title,
    n.message,
    n.priority,
    n.is_read,
    n.created_at,
    n.related_id,
    n.action_url,
    n.employee_id
  FROM public.notifications n
  WHERE n.employee_id = p_user_id
  ORDER BY n.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate notifications for all users
CREATE OR REPLACE FUNCTION generate_all_notifications()
RETURNS INTEGER AS $$
DECLARE
  user_record RECORD;
  total_notifications INTEGER := 0;
BEGIN
  -- Get all active users (you might want to adjust this query based on your user management)
  FOR user_record IN
    SELECT DISTINCT employee_id as user_id
    FROM public.notifications
    WHERE employee_id IS NOT NULL
    UNION
    SELECT DISTINCT created_by as user_id
    FROM public.orders
    WHERE created_by IS NOT NULL
    UNION
    SELECT DISTINCT created_by as user_id
    FROM public.customers
    WHERE created_by IS NOT NULL
  LOOP
    PERFORM generate_user_notifications(user_record.user_id);
    total_notifications := total_notifications + 1;
  END LOOP;
  
  RETURN total_notifications;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled function to run notification generation every 5 minutes
-- Note: This requires pg_cron extension to be enabled in Supabase
-- You can also call this manually or set up a cron job externally

-- Create function to clean up old notifications (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.notifications 
  WHERE created_at < (NOW() - INTERVAL '30 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_employee_id ON public.notifications (employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications (is_read);

-- Add RLS policies for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (employee_id = auth.uid());

-- Policy: Users can update their own notifications (for marking as read)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (employee_id = auth.uid());

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (employee_id = auth.uid());

-- Policy: System can insert notifications (for the generation function)
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
