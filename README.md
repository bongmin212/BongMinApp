# BongMin App - Order, Product & Customer Management System

A comprehensive order, product, and customer management application designed for digital license key distribution and entertainment services.

## Key Features

### 🔐 Authentication & Authorization System
- Login with username and password
- 2 account types: Manager and Employee
- Detailed role-based permissions
- Employee activity logging

### 📦 Product Management
- Manage digital license product catalog
- Multiple packages per product with different warranty periods
- Separate pricing for Partners and Retail customers
- Support for "lifetime" packages (default 2 years)

### 👥 Customer Management
- 2 customer types: Partners and Retail customers
- Track customer sources (Facebook, Telegram, Page, Web, Zalo)
- Store detailed information and notes
- View order history for each customer

### 🛒 Order Management
- Create orders with complete information
- Automatic expiration date calculation based on package duration
- Track order status (Processing, Completed, Cancelled)
- Search and filter orders by multiple criteria

### 📊 Reports & Data Export
- Export data to Excel and PDF formats
- Revenue and order statistics
- Detailed time-based reports

### 💰 Expense Management
- Track business expenses
- Categorize expenses by type
- Generate expense reports

### 📦 Inventory Management
- Warehouse management
- Inventory tracking
- Payment status monitoring
- Warranty management

## Security Setup & Configuration

### 🔒 Database Security (CRITICAL)

This application uses Supabase with Row Level Security (RLS) policies. **IMPORTANT:** The default policies are secure and role-based. Do not modify them without understanding the security implications.

#### Required Environment Variables
Create a `.env` file in the project root:
```bash
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Database Migration Order
Run these migrations in Supabase SQL editor in this exact order:

1. **Base Setup:** `supabase/reset.sql` (for fresh installations)
2. **Role Helper:** `supabase/migration_add_role_check_function.sql`
3. **RLS Policies:** `supabase/migration_fix_rls_policies.sql`
4. **Function Security:** `supabase/migration_fix_cleanup_function_permissions.sql`
5. **Password Security:** `supabase/migration_fix_password_hash_nullable.sql`
6. **Audit Logging:** `supabase/migration_add_security_audit_logs.sql`

#### Security Features Implemented

**Row Level Security (RLS) Policies:**
- ✅ Anonymous users have **NO ACCESS** to any data
- ✅ Only authenticated users can access data
- ✅ MANAGER role can delete sensitive records (customers, orders, products)
- ✅ EMPLOYEE role can read/write but cannot delete critical data
- ✅ Users can only update their own employee record (unless MANAGER)

**Function Security:**
- ✅ `cleanup_orphaned_employees()` requires MANAGER role
- ✅ Anonymous users cannot execute sensitive functions
- ✅ All functions use `SECURITY DEFINER` with proper role checks

**Password Security:**
- ✅ Password hash field is NOT NULL
- ✅ Placeholder passwords must be changed
- ✅ Password validation constraints

**Audit Logging:**
- ✅ Security events are logged to `security_audit_logs` table
- ✅ Failed login attempts tracking
- ✅ Suspicious activity detection
- ✅ Only MANAGER can view security logs

#### Rate Limiting Recommendations

**Supabase Project Settings:**
1. Go to Supabase Dashboard → Settings → API
2. Set **API Rate Limit** to:
   - Anonymous: 10 requests/minute
   - Authenticated: 100 requests/minute
3. Enable **Database Rate Limiting**:
   - Max connections: 100
   - Statement timeout: 30 seconds

**Additional Security Measures:**
- Enable **Supabase Auth** email confirmations
- Set up **Supabase Auth** password policies (minimum 8 characters)
- Enable **Supabase Auth** brute force protection
- Consider using **Supabase Edge Functions** for sensitive operations

#### Testing Security

After setup, verify security by testing:

1. **Anonymous Access Test:**
   ```bash
   # This should fail with 401/403 errors
   curl -H "Authorization: Bearer YOUR_ANON_KEY" \
        https://your-project.supabase.co/rest/v1/employees
   ```

2. **Role Permission Test:**
   - Login as EMPLOYEE → Try to delete a customer (should fail)
   - Login as MANAGER → Try to delete a customer (should succeed)

3. **Function Security Test:**
   ```sql
   -- This should fail for non-MANAGER users
   SELECT * FROM public.cleanup_orphaned_employees();
   ```

#### Security Monitoring

Monitor these tables for security events:
- `security_audit_logs` - Failed logins, suspicious activities
- `activity_logs` - User actions and system events

**Alert Thresholds:**
- More than 5 failed logins in 1 hour → Suspicious activity
- Multiple RLS policy violations → Potential attack
- Unusual access patterns → Review immediately

### ⚠️ Security Warnings

1. **Never disable RLS policies** - This would expose all data
2. **Never grant anon access** to sensitive functions
3. **Always use MANAGER role** for administrative tasks
4. **Monitor security_audit_logs** regularly
5. **Keep Supabase keys secure** - Never commit to public repos

### 🔧 Troubleshooting Security Issues

**Common Issues:**

1. **"Access denied" errors:**
   - Check if user is authenticated
   - Verify user has correct role in employees table
   - Ensure RLS policies are properly applied

2. **Function execution fails:**
   - Verify user has MANAGER role
   - Check function permissions
   - Review security_audit_logs for details

3. **Data not loading:**
   - Check authentication status
   - Verify RLS policies allow the operation
   - Review browser console for errors

**Debug Commands:**
```sql
-- Check current user role
SELECT public.is_manager();

-- Check RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- View security logs
SELECT * FROM public.security_audit_logs 
ORDER BY created_at DESC LIMIT 10;
```

## Installation & Setup

### System Requirements
- Node.js 16+
- npm or yarn

### Installation
```bash
# Clone repository
git clone <repository-url>
cd BongMinApp

# Install dependencies
npm install

# Start application
npm start
```

### Account Setup
- Create your first admin account after launching the application

## Project Structure

```
src/
├── components/          # React components
│   ├── Auth/           # Authentication
│   ├── Layout/         # Main layout
│   ├── Products/       # Product management
│   ├── Customers/      # Customer management
│   ├── Orders/         # Order management
│   ├── Expenses/       # Expense management
│   ├── ActivityLogs/   # Activity history
│   ├── Notifications/  # Notification system
│   └── Export/         # Data export
├── contexts/           # React Context
├── types/             # TypeScript types
├── utils/             # Utilities
│   ├── database.ts   # Database operations
│   ├── excel.ts      # Excel export
│   ├── supabaseClient.ts # Supabase client
│   └── supabaseAuth.ts   # Supabase authentication
└── App.tsx           # Main component
```

## Detailed Features

### Product Management
- ✅ Add, edit, delete products
- ✅ Manage product packages with different pricing
- ✅ Flexible warranty periods
- ✅ Search and filter products

### Customer Management
- ✅ Add, edit, delete customers
- ✅ Customer classification (Partner/Retail)
- ✅ Track customer sources
- ✅ View order history

### Order Management
- ✅ Create new orders
- ✅ Automatic expiration calculation
- ✅ Order status tracking
- ✅ Search and filter orders
- ✅ Revenue statistics

### Authorization System
- ✅ Login/logout functionality
- ✅ Role-based permissions
- ✅ Activity logging

### Data Export
- ✅ Excel export for all lists
- ✅ PDF export for orders and customers
- ✅ Vietnamese formatting support

### Expense Management
- ✅ Track business expenses
- ✅ Expense categorization
- ✅ Generate expense reports

### Inventory Management
- ✅ Warehouse management
- ✅ Inventory tracking
- ✅ Payment status monitoring
- ✅ Warranty management

## Technology Stack

- **Frontend:** React 18 + TypeScript
- **Styling:** CSS3 with responsive design
- **State Management:** React Context + Hooks
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Export:** xlsx, jspdf, html2canvas
- **Build Tool:** Create React App
- **Deployment:** Vercel

## Usage Guide

### 1. Authentication
- Login with your created account
- Manager accounts have full permissions
- Employee accounts have limited permissions

### 2. Product Management
- Navigate to "Products" tab to manage product list
- Navigate to "Product Packages" tab to manage product packages
- Set pricing for each customer type

### 3. Customer Management
- Navigate to "Customers" tab to manage customer list
- Classify customers and track sources
- View order history for each customer

### 4. Order Creation
- Navigate to "Orders" tab to manage orders
- Create new orders with complete information
- System automatically calculates expiration dates

### 5. Expense Management
- Navigate to "Expenses" tab to track business expenses
- Categorize expenses by type
- Generate expense reports

### 6. Data Export
- Use "Export Data" button on each page
- Choose Excel or PDF format
- Files will be downloaded to your computer

## Important Notes

- Data is stored in Supabase database
- Real-time synchronization across devices
- Offline capability with local storage backup
- Automatic data backup and recovery
- Multi-user support with role-based access

## Development

### Available Scripts
- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

### Dependencies
- React 18.2.0
- TypeScript 4.9.5
- Supabase 2.58.0
- React Router DOM 6.8.0
- XLSX 0.18.0
- jsPDF 2.5.0
- HTML2Canvas 1.4.0

