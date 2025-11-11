# BongMin App — Order, Product, and Customer Management

Comprehensive management app for distributing digital license keys and entertainment services.

## Core Features

### 🔐 Authentication & Authorization
- Username/password login
- Two roles: Manager and Employee
- Fine-grained, role-based permissions
- Employee activity logging
- Supabase Row Level Security (RLS)

### 📦 Product Management
- Manage catalog of digital-license products
- Multiple packages per product with different warranty/expiry terms
- Separate pricing for collaborators vs. retail customers
- “Lifetime” package support (defaults to 24 months)
- Custom fields per package
- Multi-profile account support

### 👥 Customer Management
- Two customer types: Collaborator and Retail
- Track acquisition source (Facebook, Telegram, Page, Web, Zalo)
- Store detailed info and notes
- Per-customer order history

### 🛒 Order Management
- Create full-detail orders
- Auto-calculate expiry date based on package term
- Order statuses: Processing, Completed, Cancelled, Expired
- Powerful search and filters
- Payment status tracking
- Renewals with full history
- Per-order custom pricing
- Link to inventory and manage profiles

### 🗃 Inventory Management
- Detailed inventory status tracking
- Track vendor payment status
- Multi-profile slots support
- Warranty and renewal management
- Auto-release profiles when expired
- Shared inventory pool across packages

### 🔧 Warranty Management
- Create and track warranty tickets
- Warranty statuses: Pending, Fixed, Replaced
- Link to replacement items from inventory

### 💰 Expense Management
- Track operating/business expenses
- Categorize by type (Purchasing, Operations, Marketing, Other)
- Generate expense reports

### 📊 Dashboard & Reports
- Overview dashboard with trend charts
- Top customers and top packages tables
- Revenue and orders statistics
- Excel and PDF export (VN formatting supported)

### 🔔 Notifications
- Expiry warnings
- New order notifications
- Payment reminders
- Profiles that need updates
- New warranty tickets
- Customizable notification settings
- Desktop and sound notifications

### 📈 Activity Logs
- Track all staff activities
- Log details of critical operations
- Data change history

## Security Setup & Configuration

### 🔒 Database Security (CRITICAL)
This app uses Supabase with strict Row Level Security (RLS). Do not change policies unless you fully understand the implications.

#### Required Environment Variables
Create a `.env` file in the project root:
```bash
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Database Migration Order
Run these SQL files in Supabase in order (for fresh installs run reset first):
1. Base setup: `supabase/reset.sql`
2. Role helper: `supabase/migration_add_role_check_function.sql`
3. RLS policies: `supabase/migration_fix_rls_policies.sql`
4. Function security: `supabase/migration_fix_cleanup_function_permissions.sql`
5. Password safety: `supabase/migration_fix_password_hash_nullable.sql`
6. Security audits: `supabase/migration_add_security_audit_logs.sql`

#### Implemented Security
- RLS: no anonymous access; authenticated only; Managers can delete sensitive records; Employees have limited write; users can update only their own employee record
- Functions: sensitive functions require Manager role; use SECURITY DEFINER with role checks
- Passwords: non-null hashes; placeholder passwords must be changed; basic constraints enforced
- Auditing: critical security events logged to `security_audit_logs`; failed login tracking; suspicious activity detection; only Managers can view

#### Rate Limiting Recommendations
- Supabase API limits: Anonymous ~10 req/min; Authenticated ~100 req/min
- DB limits: Max connections ~100; statement timeout ~30s
- Enable email confirmations; enforce password policy; enable brute force protection
- Consider Supabase Edge Functions for sensitive ops

#### Testing Security
1) Anonymous access (should fail):
```bash
curl -H "Authorization: Bearer YOUR_ANON_KEY" https://your-project.supabase.co/rest/v1/employees
```
2) Role permissions:
- Employee: deleting a customer should fail
- Manager: deleting a customer should succeed
3) Function guard (should fail if not Manager):
```sql
SELECT * FROM public.cleanup_orphaned_employees();
```

#### Security Monitoring
- Tables to monitor: `security_audit_logs` and `activity_logs`
- Alerts to watch: >5 failed logins/hour, repeated policy violations, unusual access

### ⚠️ Security Warnings
1) Never disable RLS
2) Never grant anon access to sensitive functions
3) Use Manager role for admin tasks
4) Monitor `security_audit_logs` regularly
5) Keep Supabase keys secret

### 🔧 Troubleshooting (Security)
- Access denied: ensure authentication, verify role in `employees`, confirm RLS rules
- Function fails: verify Manager role, check function perms, check audit logs
- Data not loading: check auth, RLS, and browser console

Useful SQL:
```sql
-- Who am I (app helper)
SELECT public.is_manager();
-- View policies
SELECT * FROM pg_policies WHERE schemaname = 'public';
-- Recent security events
SELECT * FROM public.security_audit_logs ORDER BY created_at DESC LIMIT 10;
```

## Installation & Setup

### Requirements
- Node.js 18+
- npm (or yarn/pnpm if you prefer)

### Install
```bash
# Clone
git clone <repository-url>
cd BongMinApp

# Dependencies
npm install

# Dev server
npm start
```

### Build & Deploy
```bash
# Production build
npm run build
```
- Deploy the `build/` output (e.g., Vercel). Copy `.env` vars to your hosting provider.
- `vercel.json` is present for basic Vercel config.

### First-time Account
- Create the first Manager account after launch (or seed via Supabase if desired)

## Project Structure

```
src/
├── components/          # React components
│   ├── Auth/            # Authentication UI
│   ├── Layout/          # Header, sidebar, app shell
│   ├── Products/        # Product & package management
│   │   ├── ProductList.tsx
│   │   ├── ProductForm.tsx
│   │   ├── PackageList.tsx
│   │   ├── PackageForm.tsx
│   │   ├── WarehouseList.tsx
│   │   └── WarehouseForm.tsx
│   ├── Customers/       # Customer management
│   │   ├── CustomerList.tsx
│   │   ├── CustomerForm.tsx
│   │   └── CustomerOrderHistory.tsx
│   ├── Orders/          # Order, details, warranty
│   │   ├── OrderList.tsx
│   │   ├── OrderForm.tsx
│   │   ├── OrderDetailsModal.tsx
│   │   └── WarrantyList.tsx
│   ├── Expenses/        # Expenses module
│   │   └── ExpenseList.tsx
│   ├── Dashboard/       # Overview & analytics
│   │   ├── Dashboard.tsx
│   │   ├── TrendsChart.tsx
│   │   ├── TopCustomersTable.tsx
│   │   └── TopPackagesTable.tsx
│   ├── ActivityLogs/    # Staff actions history
│   │   └── ActivityLogList.tsx
│   ├── Notifications/   # Alerts panel
│   │   └── NotificationPanel.tsx
│   ├── Export/          # Data export helpers
│   ├── Shared/          # Shared components
│   │   └── DateRangeInput.tsx
│   └── Icons.tsx        # Icon components
├── contexts/            # React Contexts
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   ├── ToastContext.tsx
│   └── NotificationContext.tsx
├── types/               # TypeScript types
│   └── index.ts
├── utils/               # Utilities
│   ├── database.ts              # DB ops
│   ├── excel.ts                 # Excel export
│   ├── money.ts                 # Currency formatting
│   ├── date.ts                  # Date helpers
│   ├── supabaseClient.ts        # Supabase client
│   ├── supabaseAuth.ts          # Auth helpers
│   ├── supabaseRealtime.ts      # Realtime listeners
│   ├── supabaseSync.ts          # Data sync
│   ├── desktopNotification.ts   # Desktop notifications
│   ├── notificationSound.ts     # Audio notifications
│   └── excel.ts                 # Excel helpers
└── App.tsx              # Main component
```

## Detailed Capabilities

### Products
- Add/edit/remove products and packages
- Flexible warranty/expiry terms
- Search, filter, and custom fields
- Multi-profile accounts

### Customers
- Add/edit/remove customers
- Classify Collaborator vs Retail
- Track acquisition source
- Stable customer codes
- Full order history

### Orders
- Create/renew orders with history
- Auto expiry calculation
- Statuses and filters
- Revenue stats
- Custom pricing per order
- Link to inventory and manage slots

### Inventory
- Detailed status and payments
- Multi-profile slot management
- Warranty and renewals
- Auto release expired profiles
- Shared pool

### Warranty
- Tickets, status, linking replacements
- History

### Data Export
- Excel for all lists
- PDF for orders and customers
- Vietnamese formatting supported

### Expenses
- Track, categorize, and report
- Excel report export

### Dashboard & Analytics
- Overview, trends, tops, and time series
- Recharts-based visualizations

### Notifications
- Expiry, new orders, payments, profiles, warranty
- Desktop + sound notifications

## Technology Stack
- Frontend: React 18.2.0 + TypeScript ^4.9.5
- Styling: CSS, responsive layout
- State: React Context + Hooks
- Database: Supabase (PostgreSQL) with RLS
- Auth: Supabase Auth with custom roles
- Charts: Recharts ^2.15.4
- Export: xlsx ^0.18.5, jspdf ^3.0.3, jspdf-autotable ^5.0.2, html2canvas ^1.4.0
- Virtualization: react-window ^1.8.8
- Build: Create React App 5 (+ cross-env)
- Deployment: Vercel
- Realtime: Supabase Realtime

## Usage Guide
1) Login with your account (Manager = full access; Employee = restricted)
2) Products tab: manage products, packages, warehouse, custom fields, pricing
3) Customers tab: manage customers, types, sources, and view history
4) Orders tab: create/manage orders, link inventory, renew, custom pricing
5) Warranty tab: create/manage tickets, statuses, replacements
6) Expenses tab: track expenses and export reports
7) Dashboard: trends, tops, and exports
8) Exports: use export buttons on each page (Excel/PDF)
9) Notifications: view panel, configure types, desktop/audio

## Important Notes
- Data stored in Supabase; realtime sync across devices
- Basic offline safety via local storage fallback
- Automated backups/restore recommended (via Supabase)
- Multi-user with role-based permissions
- RLS protection across all data
- Realtime notifications (desktop + sound)
- Virtualized lists for performance
- Responsive UI

## Development

### Scripts
- `npm start` — Start dev server
- `npm run build` — Production build
- `npm test` — Run tests
- `npm run eject` — CRA eject

### Key Dependencies
- react ^18.2.0, react-dom ^18.2.0
- typescript ^4.9.5
- @supabase/supabase-js ^2.58.0
- react-router-dom ^6.8.0
- recharts ^2.15.4
- react-window ^1.8.8
- xlsx ^0.18.5
- jspdf ^3.0.3, jspdf-autotable ^5.0.2
- html2canvas ^1.4.0
- cross-env ^7.0.3

## Recent Changes (Latest Highlights)
- Added Notifications module and panel (desktop and sound alerts)
- Added Expenses module and Excel reporting
- Added Dashboard: trends, top customers, top packages
- Expanded Inventory features: multi-profile, shared pool, vendor payment status
- Added Warranty management and linking replacements
- Strengthened security: role checker function, RLS fixes, function permissions
- Added Security Audit Logs and Activity Logs
- Improved Order Management (filters, renewals, custom pricing)


