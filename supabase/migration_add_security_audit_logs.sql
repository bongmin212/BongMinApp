-- Migration: Add security audit logging table and triggers
-- Run this in Supabase SQL editor

-- Create security audit logs table
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- 'failed_login', 'rls_violation', 'suspicious_activity', etc.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ip_address inet,
  user_agent text,
  details jsonb,
  severity text NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on security audit logs
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only MANAGER can read security audit logs
CREATE POLICY "security_audit_logs_read_manager_only" ON public.security_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_manager());

-- All authenticated users can insert security audit logs (for logging their own activities)
CREATE POLICY "security_audit_logs_insert_all" ON public.security_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only MANAGER can update/delete security audit logs
CREATE POLICY "security_audit_logs_update_manager_only" ON public.security_audit_logs
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "security_audit_logs_delete_manager_only" ON public.security_audit_logs
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id ON public.security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at ON public.security_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_severity ON public.security_audit_logs(severity);

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_user_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_severity text DEFAULT 'INFO'
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.security_audit_logs (
    event_type,
    user_id,
    employee_id,
    ip_address,
    user_agent,
    details,
    severity
  ) VALUES (
    p_event_type,
    p_user_id,
    p_employee_id,
    p_ip_address,
    p_user_agent,
    p_details,
    p_severity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.log_security_event TO authenticated;

-- Function to detect suspicious activities (multiple failed attempts)
CREATE OR REPLACE FUNCTION public.check_suspicious_activity()
RETURNS void AS $$
DECLARE
  failed_attempts_count integer;
  recent_failed_attempts integer;
BEGIN
  -- Count failed login attempts in the last hour
  SELECT COUNT(*) INTO recent_failed_attempts
  FROM public.security_audit_logs
  WHERE event_type = 'failed_login'
    AND created_at > NOW() - INTERVAL '1 hour';
  
  -- If more than 5 failed attempts in the last hour, log as suspicious
  IF recent_failed_attempts > 5 THEN
    PERFORM public.log_security_event(
      'suspicious_activity',
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object(
        'failed_attempts_count', recent_failed_attempts,
        'time_window', '1 hour',
        'threshold', 5
      ),
      'WARNING'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_suspicious_activity TO authenticated;
