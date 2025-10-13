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
│   ├── Employees/      # Employee management
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
- ✅ Employee management (Manager only)

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

