# BongMin App

> Full-stack business management system for digital license key distribution — built solo as a real-world production application.

**Live project** managing 871+ orders, 148+ customers, 306+ inventory items with real revenue data.

---

## 🎯 Project Overview

BongMin App is a **production-grade internal tool** designed to replace manual spreadsheet workflows for a digital product reselling business. Built entirely from scratch, it handles the full business lifecycle: product catalog, inventory, customer relationships, orders, warranties, financials, and analytics — all in one integrated system.

**Why it matters for your CV**: This isn't a tutorial project. It runs real money transactions, has been iterated on for months based on actual business needs, and demonstrates full-stack engineering judgment across data modeling, UX design, security, and performance optimization.

---

## ✨ Key Features

### 🔐 Authentication & Role-Based Access Control
- Custom username/password auth on top of Supabase Auth
- Two roles: **Manager** (full access) and **Employee** (restricted)
- Fine-grained permissions enforced at both UI and database (RLS) levels
- Session persistence and secure logout
- Employee activity logging for audit trails

### 📦 Product & Package Management
- Multi-tier catalog: Products → Packages (e.g., Netflix 1-month, 3-month, 12-month)
- **Dual pricing model**: separate price for Collaborators (CTV) vs. Retail customers
- Custom fields per package (configurable key-value metadata)
- Multi-profile account support (one inventory item, multiple customer slots)
- Shared inventory pool mode across packages

### 👥 CRM — Customer Management
- Customer classification: Collaborator (CTV) vs. Retail
- Acquisition source tracking (Facebook, Telegram, Zalo, Web, Page)
- Full order history per customer with revenue & profit breakdown
- Smart deduplication (unique customer codes)
- Protected deletion: cannot delete customers with linked order history

### 🛒 Order Management (Core Module)
- End-to-end order lifecycle: Creating → Processing → Completed → Expired/Cancelled
- Auto-expiry calculation from package warranty period
- **Custom pricing** override per order
- **Custom expiry** override when needed
- Renewal system with full renewal history
- Linked inventory slot assignment (with profile-level tracking)
- Payment status: Unpaid / Paid / Refunded
- Partial refund support with adjusted revenue and COGS calculation
- Advanced search & multi-filter: by status, payment, customer, product, expiry, date range
- Deep-link navigation from Dashboard to specific orders
- Renewal reminder message tracking (sent/not sent, by whom)

### 🗃 Inventory (Warehouse) Management
- Detailed item status: Available / Reserved / Sold / Expired / Needs Update
- **Multi-slot account**: single inventory item serving multiple customers simultaneously
- Per-slot profile assignment and tracking
- Vendor payment tracking per item (Unpaid / Paid / Refunded)
- Supplier management with supplier name/ID
- Inventory renewal system with date tracking and cost logging
- Auto-deactivation of expired slots when all linked orders expire
- COGS (Cost of Goods Sold) snapshot captured at order time for accurate profit calc
- Shared pool inventory for products without fixed license slots

### 🔧 Warranty Management
- Ticket-based warranty system linked to orders
- Statuses: Pending → Fixed / Replaced
- Replacement inventory assignment from existing stock
- Staff attribution and timestamped history

### 💰 Expense Tracking
- Record operational expenses with categories (Purchasing, Operations, Marketing, Other)
- Monthly expense summaries feeding into Dashboard net profit calculation
- Excel export for accounting

### 📊 Analytics Dashboard (5 Tabs)
**Overview Tab:**
- KPI cards: total products, customers, orders, revenue, net profit
- Recent orders quick-access with deep-link navigation

**Sales Tab:**
- Month selector with YoY-style comparison
- Monthly revenue, profit, refunds, expenses, import costs
- Order backlog: unpaid count, processing count, cancelled count, expected revenue, expiring soon
- **12-month trend chart** (Recharts AreaChart) — revenue, profit, expenses overlay
- **🤖 Predictive Analytics** — 7-day revenue forecast using **OLS Linear Regression** (pure JS, no ML library):
  - Aggregates last 30 days of daily revenue as training data
  - Projects 7 future days using fitted linear model
  - Displayed as dashed orange forecast line alongside solid actual line
  - Vertical "Today" reference line separating history from forecast
  - Labeled "Inventory Planning" — helps decide when to restock
- Top-selling packages table with revenue & profit per package

**Inventory Tab:** Live inventory breakdown with status drill-down

**Customers Tab:** Customer segments (CTV vs Retail) + Top customers by revenue/profit table

**Data Audit Tab:** Cross-table reconciliation reports for data integrity checking

### 🔁 Data Reconciliation (Data Audit)
- Automated checks across `orders` and `inventory` tables
- Detects: price inconsistencies, incorrect COGS, broken order-inventory links, incorrect payment statuses
- Visual report with severity levels and export

### 🔔 Notification System
- Real-time in-app notification panel
- Event types: expiring orders (7-day warning), expiring inventory, unpaid orders, items needing profile update, new warranties
- **Desktop push notifications** (Web Notifications API)
- **Audio alerts** with configurable sound
- Per-type notification toggle settings
- Unread badge count on notification icon

### 📈 Activity Logs
- Immutable log of all staff actions (create, update, delete, login, logout)
- Timestamped with employee attribution
- Filterable and paginated
- Manager-only access to sensitive logs

### 📤 Export
- **Excel export** (XLSX) for all major data tables: orders, customers, inventory, expenses, warranties
- **PDF export** for order lists and customer history
- Vietnamese currency formatting (₫) and locale-aware date formatting

---

## 🔒 Security Architecture

| Layer | Implementation |
|---|---|
| Database | Supabase PostgreSQL with Row Level Security (RLS) on all tables |
| Auth | Supabase Auth + custom employee role lookup |
| Role checks | PostgreSQL function `public.is_manager()` used in RLS policies and SECURITY DEFINER functions |
| Anonymous access | Blocked at RLS level — no data accessible without auth |
| Employee permissions | Read-only on sensitive tables; write only on own records |
| Sensitive functions | Wrapped in SECURITY DEFINER; role-checked before execution |
| Audit log | `security_audit_logs` table for failed logins, policy violations, suspicious access |
| Passwords | Non-null hash enforcement; placeholder detection |

---

## 📐 Data Model (Key Tables)

```
employees           → Staff accounts with roles
customers           → Customer CRM records
products            → Product catalog
packages            → Pricing tiers per product
inventory           → Physical/digital stock items (multi-slot support)
inventory_renewals  → Renewal history per inventory item
orders              → Sales transactions with snapshot pricing
warranties          → Warranty tickets linked to orders
expenses            → Operating expense ledger
activity_logs       → Immutable staff action log
notifications       → In-app notification queue
```

---

## 🛠 Tech Stack

| Area | Technology |
|---|---|
| **Frontend** | React 18.2, TypeScript 4.9 |
| **State Management** | React Context API + custom hooks |
| **Routing** | React Router DOM v6 |
| **Database** | Supabase (PostgreSQL 17) |
| **Auth** | Supabase Auth (custom employee model on top) |
| **Real-time** | Supabase Realtime (WebSocket subscriptions) |
| **Charts** | Recharts 2.15 (AreaChart, LineChart, ReferenceLine) |
| **Predictive ML** | Custom OLS Linear Regression (pure TypeScript, no library) |
| **Export** | xlsx 0.18, jsPDF 3.0, jspdf-autotable 5.0, html2canvas 1.4 |
| **Performance** | react-window 1.8 (virtualized lists for large datasets) |
| **Styling** | Custom CSS (design system with variables, dark/light mode support) |
| **Build** | Create React App 5, cross-env |
| **Deployment** | Vercel (with vercel.json config) |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── Auth/                  # Login page
│   ├── Dashboard/             # Analytics dashboard (5 tabs)
│   │   ├── Dashboard.tsx      # Main orchestrator (1132 lines)
│   │   ├── TrendsChart.tsx    # Monthly trends + 7-day forecast chart
│   │   ├── DataAudit.tsx      # Data reconciliation reports
│   │   ├── TopPackagesTable.tsx
│   │   └── TopCustomersTable.tsx
│   ├── Orders/
│   │   ├── OrderList.tsx      # Order management with filters
│   │   ├── OrderForm.tsx      # Order create/edit with inventory linking
│   │   ├── OrderDetailsModal.tsx
│   │   └── WarrantyList.tsx
│   ├── Products/
│   │   ├── ProductList/Form   # Product catalog
│   │   ├── PackageList/Form   # Pricing packages
│   │   └── WarehouseList/Form # Inventory management
│   ├── Customers/
│   │   ├── CustomerList/Form
│   │   └── CustomerOrderHistory.tsx
│   ├── Expenses/
│   ├── Notifications/
│   ├── ActivityLogs/
│   └── Layout/                # App shell, sidebar, header
├── contexts/
│   ├── AuthContext.tsx         # Global auth state
│   ├── ThemeContext.tsx        # Light/dark mode
│   ├── ToastContext.tsx        # Toast notification system
│   └── NotificationContext.tsx
├── utils/
│   ├── forecast.ts            # OLS Linear Regression engine
│   ├── supabaseClient.ts      # DB connection
│   ├── supabaseAuth.ts        # Auth helpers
│   ├── supabaseRealtime.ts    # Real-time subscriptions
│   ├── supabaseSync.ts        # Data synchronization
│   ├── database.ts            # Offline fallback (localStorage)
│   ├── excel.ts               # Excel export helpers
│   ├── money.ts               # VND currency formatting
│   ├── date.ts                # Date utilities
│   ├── desktopNotification.ts # Push notification API
│   └── notificationSound.ts  # Audio alert system
└── types/index.ts             # Shared TypeScript interfaces
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (PostgreSQL)

### Setup
```bash
git clone <repository-url>
cd BongMinApp
npm install

# Configure environment
cp .env.example .env
# Fill in REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY

npm start       # Development server at http://localhost:3000
npm run build   # Production build → deploy build/ to Vercel
```

### Database Setup
Run migration SQL files in order against your Supabase project:
1. `supabase/reset.sql` — base schema
2. `supabase/migration_add_role_check_function.sql`
3. `supabase/migration_fix_rls_policies.sql`
4. `supabase/migration_fix_cleanup_function_permissions.sql`
5. `supabase/migration_fix_password_hash_nullable.sql`
6. `supabase/migration_add_security_audit_logs.sql`

---

## 🧠 Engineering Highlights (CV-Relevant)

- **Real production data**: 871 orders, 148 customers, 306 inventory items running in production
- **Complex financial logic**: COGS snapshot at order time, partial refund ratios, net profit after import cost & external expenses — all without double-counting
- **ML-adjacent feature**: implemented OLS Linear Regression from scratch in TypeScript without any ML library to forecast 7-day revenue for inventory planning
- **Data integrity system**: automated cross-table reconciliation detects COGS/price/link inconsistencies between orders and inventory
- **Multi-slot inventory model**: one inventory item can serve N customers simultaneously, with per-slot profile tracking and smart deactivation logic
- **Optimistic UI patterns**: deep-link navigation via custom browser events, virtualized lists for 800+ item datasets
- **Security-first design**: Supabase RLS + SECURITY DEFINER functions + audit logging — zero raw data exposure to anonymous clients
- **Real-time architecture**: WebSocket-based data sync via Supabase Realtime for multi-user consistency

---

## 📅 Development Timeline

This project was built and iterated incrementally to solve real business problems:

- Multi-slot inventory with smart deactivation logic
- COGS snapshot calculation for accurate profit reporting
- Partial refund system (proportional COGS adjustment)
- Data Reconciliation audit system
- Predictive Analytics with 7-day Linear Regression forecast
- Paginated warehouse list (newest-first with "load more")
- Activity Logs with employee attribution
- Notification system (desktop + audio)
- Data export to Excel & PDF

---

*Built by Minh Phạm — solo full-stack project demonstrating production-grade React/TypeScript/PostgreSQL engineering.*
