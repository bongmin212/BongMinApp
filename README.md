# BongMin App - Hệ thống Quản lý Đơn hàng, Sản phẩm & Khách hàng

Ứng dụng quản lý toàn diện cho việc phân phối khóa bản quyền số và dịch vụ giải trí.

## Tính năng chính

### 🔐 Hệ thống Xác thực & Phân quyền
- Đăng nhập bằng tên người dùng và mật khẩu
- 2 loại tài khoản: Quản lý và Nhân viên
- Phân quyền chi tiết theo vai trò
- Ghi log hoạt động nhân viên
- Bảo mật Row Level Security (RLS) với Supabase

### 📦 Quản lý Sản phẩm
- Quản lý danh mục sản phẩm bản quyền số
- Nhiều gói sản phẩm với thời hạn bảo hành khác nhau
- Giá riêng cho Cộng tác viên và Khách lẻ
- Hỗ trợ gói "vĩnh viễn" (mặc định 2 năm)
- Trường tùy chỉnh cho từng gói sản phẩm
- Hỗ trợ tài khoản đa profile

### 👥 Quản lý Khách hàng
- 2 loại khách hàng: Cộng tác viên (CTV) và Khách lẻ
- Theo dõi nguồn khách hàng (Facebook, Telegram, Page, Web, Zalo)
- Lưu trữ thông tin chi tiết và ghi chú
- Xem lịch sử đơn hàng của từng khách hàng

### 🛒 Quản lý Đơn hàng
- Tạo đơn hàng với thông tin đầy đủ
- Tính toán tự động ngày hết hạn dựa trên thời hạn gói
- Theo dõi trạng thái đơn hàng (Đang xử lý, Hoàn thành, Đã hủy, Đã hết hạn)
- Tìm kiếm và lọc đơn hàng theo nhiều tiêu chí
- Quản lý trạng thái thanh toán
- Gia hạn đơn hàng với lịch sử chi tiết
- Giá tùy chỉnh cho từng đơn hàng
- Liên kết với kho hàng và quản lý profile

### 📦 Quản lý Kho hàng (Inventory)
- Quản lý kho hàng với trạng thái chi tiết
- Theo dõi trạng thái thanh toán với nhà cung cấp
- Hỗ trợ tài khoản đa profile với slots
- Quản lý bảo hành và gia hạn kho hàng
- Tự động giải phóng profile khi hết hạn
- Chia sẻ pool kho hàng giữa các gói sản phẩm

### 🔧 Quản lý Bảo hành
- Tạo và theo dõi yêu cầu bảo hành
- Trạng thái bảo hành: Chưa xong, Đã fix, Đã đổi bảo hành
- Liên kết với sản phẩm thay thế từ kho hàng

### 💰 Quản lý Chi phí
- Theo dõi chi phí kinh doanh
- Phân loại chi phí theo loại (Mua hàng, Vận hành, Marketing, Khác)
- Tạo báo cáo chi phí

### 📊 Dashboard & Báo cáo
- Dashboard tổng quan với biểu đồ xu hướng
- Bảng top khách hàng và gói sản phẩm
- Thống kê doanh thu và đơn hàng
- Xuất dữ liệu Excel và PDF với định dạng tiếng Việt

### 🔔 Hệ thống Thông báo
- Thông báo cảnh báo hết hạn
- Thông báo đơn hàng mới
- Nhắc nhở thanh toán
- Thông báo profile cần cập nhật
- Thông báo bảo hành mới
- Cài đặt thông báo tùy chỉnh

### 📈 Ghi log Hoạt động
- Theo dõi tất cả hoạt động của nhân viên
- Ghi log chi tiết các thao tác quan trọng
- Lịch sử thay đổi dữ liệu

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

## Cấu trúc Dự án

```
src/
├── components/          # React components
│   ├── Auth/           # Xác thực
│   ├── Layout/         # Layout chính
│   ├── Products/       # Quản lý sản phẩm
│   │   ├── ProductList.tsx
│   │   ├── ProductForm.tsx
│   │   ├── PackageList.tsx
│   │   ├── PackageForm.tsx
│   │   ├── WarehouseList.tsx
│   │   └── WarehouseForm.tsx
│   ├── Customers/      # Quản lý khách hàng
│   │   ├── CustomerList.tsx
│   │   ├── CustomerForm.tsx
│   │   └── CustomerOrderHistory.tsx
│   ├── Orders/         # Quản lý đơn hàng
│   │   ├── OrderList.tsx
│   │   ├── OrderForm.tsx
│   │   ├── OrderDetailsModal.tsx
│   │   └── WarrantyList.tsx
│   ├── Expenses/       # Quản lý chi phí
│   │   └── ExpenseList.tsx
│   ├── Dashboard/      # Dashboard & báo cáo
│   │   ├── Dashboard.tsx
│   │   ├── TrendsChart.tsx
│   │   ├── TopCustomersTable.tsx
│   │   └── TopPackagesTable.tsx
│   ├── ActivityLogs/   # Lịch sử hoạt động
│   │   └── ActivityLogList.tsx
│   ├── Notifications/  # Hệ thống thông báo
│   │   └── NotificationPanel.tsx
│   ├── Export/         # Xuất dữ liệu
│   ├── Shared/         # Components dùng chung
│   │   └── DateRangeInput.tsx
│   └── Icons.tsx       # Icon components
├── contexts/           # React Context
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   ├── ToastContext.tsx
│   └── NotificationContext.tsx
├── types/             # TypeScript types
│   └── index.ts
├── utils/             # Utilities
│   ├── database.ts    # Database operations
│   ├── excel.ts       # Excel export
│   ├── money.ts       # Currency formatting
│   ├── date.ts        # Date utilities
│   ├── supabaseClient.ts    # Supabase client
│   ├── supabaseAuth.ts      # Supabase authentication
│   ├── supabaseRealtime.ts  # Real-time subscriptions
│   ├── supabaseSync.ts      # Data synchronization
│   ├── desktopNotification.ts # Desktop notifications
│   ├── notificationSound.ts  # Sound notifications
│   └── excel.ts       # Excel export utilities
└── App.tsx           # Main component
```

## Tính năng Chi tiết

### Quản lý Sản phẩm
- ✅ Thêm, sửa, xóa sản phẩm
- ✅ Quản lý gói sản phẩm với giá khác nhau
- ✅ Thời hạn bảo hành linh hoạt
- ✅ Tìm kiếm và lọc sản phẩm
- ✅ Trường tùy chỉnh cho từng gói
- ✅ Hỗ trợ tài khoản đa profile

### Quản lý Khách hàng
- ✅ Thêm, sửa, xóa khách hàng
- ✅ Phân loại khách hàng (CTV/Khách lẻ)
- ✅ Theo dõi nguồn khách hàng
- ✅ Xem lịch sử đơn hàng
- ✅ Mã khách hàng cố định

### Quản lý Đơn hàng
- ✅ Tạo đơn hàng mới
- ✅ Tính toán tự động ngày hết hạn
- ✅ Theo dõi trạng thái đơn hàng
- ✅ Tìm kiếm và lọc đơn hàng
- ✅ Thống kê doanh thu
- ✅ Gia hạn đơn hàng với lịch sử
- ✅ Giá tùy chỉnh cho từng đơn
- ✅ Liên kết với kho hàng
- ✅ Quản lý profile slots

### Quản lý Kho hàng
- ✅ Quản lý kho hàng chi tiết
- ✅ Theo dõi trạng thái thanh toán
- ✅ Hỗ trợ tài khoản đa profile
- ✅ Quản lý bảo hành và gia hạn
- ✅ Tự động giải phóng profile
- ✅ Chia sẻ pool kho hàng

### Quản lý Bảo hành
- ✅ Tạo yêu cầu bảo hành
- ✅ Theo dõi trạng thái bảo hành
- ✅ Liên kết sản phẩm thay thế
- ✅ Lịch sử bảo hành chi tiết

### Hệ thống Xác thực
- ✅ Đăng nhập/đăng xuất
- ✅ Phân quyền theo vai trò
- ✅ Ghi log hoạt động
- ✅ Bảo mật Row Level Security

### Xuất Dữ liệu
- ✅ Xuất Excel cho tất cả danh sách
- ✅ Xuất PDF cho đơn hàng và khách hàng
- ✅ Hỗ trợ định dạng tiếng Việt
- ✅ Tùy chỉnh báo cáo

### Quản lý Chi phí
- ✅ Theo dõi chi phí kinh doanh
- ✅ Phân loại chi phí
- ✅ Tạo báo cáo chi phí
- ✅ Xuất báo cáo Excel

### Dashboard & Thống kê
- ✅ Dashboard tổng quan
- ✅ Biểu đồ xu hướng doanh thu
- ✅ Top khách hàng và gói sản phẩm
- ✅ Thống kê theo thời gian
- ✅ Biểu đồ trực quan với Recharts

### Hệ thống Thông báo
- ✅ Thông báo cảnh báo hết hạn
- ✅ Thông báo đơn hàng mới
- ✅ Nhắc nhở thanh toán
- ✅ Thông báo profile cần cập nhật
- ✅ Thông báo bảo hành mới
- ✅ Cài đặt thông báo tùy chỉnh
- ✅ Desktop notifications
- ✅ Sound notifications

## Technology Stack

- **Frontend:** React 18.2.0 + TypeScript 4.9.5
- **Styling:** CSS3 với responsive design
- **State Management:** React Context + Hooks
- **Database:** Supabase (PostgreSQL) với Row Level Security
- **Authentication:** Supabase Auth với phân quyền tùy chỉnh
- **Charts:** Recharts 2.15.4 cho dashboard
- **Export:** xlsx 0.18.5, jspdf 3.0.3, jspdf-autotable 5.0.2, html2canvas 1.4.0
- **Virtualization:** react-window 1.8.8 cho danh sách lớn
- **Build Tool:** Create React App với cross-env
- **Deployment:** Vercel
- **Real-time:** Supabase Realtime cho đồng bộ dữ liệu

## Hướng dẫn Sử dụng

### 1. Xác thực
- Đăng nhập bằng tài khoản đã tạo
- Tài khoản Quản lý có quyền đầy đủ
- Tài khoản Nhân viên có quyền hạn chế

### 2. Quản lý Sản phẩm
- Vào tab "Sản phẩm" để quản lý danh sách sản phẩm
- Vào tab "Gói sản phẩm" để quản lý các gói sản phẩm
- Vào tab "Kho hàng" để quản lý kho hàng
- Thiết lập giá cho từng loại khách hàng
- Cấu hình trường tùy chỉnh cho gói sản phẩm

### 3. Quản lý Khách hàng
- Vào tab "Khách hàng" để quản lý danh sách khách hàng
- Phân loại khách hàng và theo dõi nguồn
- Xem lịch sử đơn hàng của từng khách hàng

### 4. Tạo Đơn hàng
- Vào tab "Đơn hàng" để quản lý đơn hàng
- Tạo đơn hàng mới với thông tin đầy đủ
- Hệ thống tự động tính ngày hết hạn
- Liên kết với kho hàng và quản lý profile
- Sử dụng giá tùy chỉnh nếu cần

### 5. Quản lý Bảo hành
- Vào tab "Bảo hành" để quản lý yêu cầu bảo hành
- Tạo yêu cầu bảo hành mới
- Theo dõi trạng thái và xử lý bảo hành
- Liên kết với sản phẩm thay thế từ kho hàng

### 6. Quản lý Chi phí
- Vào tab "Chi phí" để theo dõi chi phí kinh doanh
- Phân loại chi phí theo loại
- Tạo báo cáo chi phí

### 7. Dashboard & Báo cáo
- Vào tab "Dashboard" để xem tổng quan
- Xem biểu đồ xu hướng doanh thu
- Xem top khách hàng và gói sản phẩm
- Xuất báo cáo Excel và PDF

### 8. Xuất Dữ liệu
- Sử dụng nút "Xuất dữ liệu" trên mỗi trang
- Chọn định dạng Excel hoặc PDF
- File sẽ được tải về máy tính

### 9. Thông báo
- Xem thông báo trong panel thông báo
- Cài đặt loại thông báo muốn nhận
- Nhận thông báo desktop và âm thanh

## Lưu ý Quan trọng

- Dữ liệu được lưu trữ trong cơ sở dữ liệu Supabase
- Đồng bộ thời gian thực trên nhiều thiết bị
- Khả năng hoạt động offline với backup local storage
- Sao lưu và khôi phục dữ liệu tự động
- Hỗ trợ đa người dùng với phân quyền theo vai trò
- Bảo mật Row Level Security (RLS) cho tất cả dữ liệu
- Hệ thống thông báo real-time với desktop notifications
- Virtualization cho hiệu suất tốt với danh sách lớn
- Hỗ trợ đa ngôn ngữ (tiếng Việt)
- Responsive design cho mọi thiết bị

## Development

### Available Scripts
- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

### Dependencies
- React 18.2.0 + React DOM 18.2.0
- TypeScript 4.9.5
- Supabase 2.58.0
- React Router DOM 6.8.0
- Recharts 2.15.4 (Dashboard charts)
- React Window 1.8.8 (Virtualization)
- XLSX 0.18.5 (Excel export)
- jsPDF 3.0.3 + jsPDF AutoTable 5.0.2 (PDF export)
- HTML2Canvas 1.4.0 (Screenshot for PDF)
- Cross-env 7.0.3 (Environment variables)

