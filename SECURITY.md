# Security Deployment Checklist

## Pre-Deployment Security Checklist

### ✅ Database Security
- [ ] Run all migration files in correct order
- [ ] Verify RLS policies are active (`SELECT * FROM pg_policies WHERE schemaname = 'public';`)
- [ ] Test that anonymous users cannot access data
- [ ] Verify MANAGER-only functions work correctly
- [ ] Check that password_hash field is NOT NULL

### ✅ Environment Variables
- [ ] Create `.env` file with Supabase credentials
- [ ] Verify `.env` is in `.gitignore`
- [ ] Never commit `.env` to version control
- [ ] Use different Supabase projects for dev/staging/production

### ✅ Supabase Project Settings
- [ ] Enable Row Level Security on all tables
- [ ] Set appropriate API rate limits
- [ ] Enable email confirmations for auth
- [ ] Set password policies (minimum 8 characters)
- [ ] Enable brute force protection
- [ ] Configure CORS settings for your domain

### ✅ Application Security
- [ ] Test login/logout functionality
- [ ] Verify role-based permissions work
- [ ] Test that EMPLOYEE cannot delete critical data
- [ ] Verify MANAGER has full access
- [ ] Check that users can only update their own employee record

### ✅ Monitoring Setup
- [ ] Monitor `security_audit_logs` table
- [ ] Set up alerts for suspicious activities
- [ ] Review failed login attempts regularly
- [ ] Monitor API usage patterns

## Post-Deployment Security Monitoring

### Daily Checks
- [ ] Review security_audit_logs for anomalies
- [ ] Check for failed login attempts
- [ ] Monitor API usage patterns
- [ ] Verify no unauthorized access attempts

### Weekly Checks
- [ ] Review employee role assignments
- [ ] Check for unusual data access patterns
- [ ] Verify backup integrity
- [ ] Review and rotate any temporary credentials

### Monthly Checks
- [ ] Security audit of RLS policies
- [ ] Review and update password policies
- [ ] Check for Supabase security updates
- [ ] Review access logs and permissions

## Emergency Security Procedures

### If Security Breach Suspected
1. **Immediate Actions:**
   - Change all Supabase project passwords
   - Revoke and regenerate API keys
   - Review security_audit_logs for breach details
   - Notify all users to change passwords

2. **Investigation:**
   - Export security_audit_logs for analysis
   - Check for unauthorized data access
   - Review employee role changes
   - Analyze API usage patterns

3. **Recovery:**
   - Restore from backup if necessary
   - Update all security policies
   - Implement additional monitoring
   - Conduct security training for team

### Contact Information
- **Supabase Support:** https://supabase.com/support
- **Security Issues:** Report to your security team immediately
- **Emergency Contacts:** [Add your emergency contact information]

## Security Best Practices

### For Developers
- Never commit `.env` files
- Always test security policies before deployment
- Use MANAGER role for administrative tasks only
- Review code changes for security implications
- Keep dependencies updated

### For Administrators
- Regularly review user roles and permissions
- Monitor security logs daily
- Keep Supabase project updated
- Use strong, unique passwords
- Enable 2FA where possible

### For Users
- Use strong passwords (8+ characters)
- Log out when finished
- Report suspicious activities immediately
- Don't share login credentials
- Keep browser updated

## Testing Commands

### Verify RLS Policies
```sql
-- Check all policies are active
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Test Anonymous Access (Should Fail)
```bash
curl -H "Authorization: Bearer YOUR_ANON_KEY" \
     https://your-project.supabase.co/rest/v1/employees
```

### Test Role-Based Access
```sql
-- Test as different users
SELECT public.is_manager();
SELECT * FROM public.employees LIMIT 1;
```

### Check Security Logs
```sql
-- Recent security events
SELECT event_type, severity, details, created_at 
FROM public.security_audit_logs 
ORDER BY created_at DESC 
LIMIT 20;
```

## Version History
- v1.0: Initial security implementation
- v1.1: Added security audit logging
- v1.2: Enhanced RLS policies and function security
