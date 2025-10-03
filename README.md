# BongMin App - Quản lý đơn hàng, sản phẩm và khách hàng

Ứng dụng quản lý đơn hàng, sản phẩm và khách hàng dành cho lĩnh vực phân phối key bản quyền số và dịch vụ giải trí.

## Tính năng chính

### 🔐 Hệ thống xác thực và phân quyền
- Đăng nhập bằng tên đăng nhập và mật khẩu
- 2 loại tài khoản: Quản lý và Nhân viên
- Phân quyền chi tiết theo vai trò
- Lưu lịch sử hoạt động của nhân viên

### 📦 Quản lý sản phẩm
- Quản lý danh sách sản phẩm bản quyền
- Mỗi sản phẩm có nhiều gói với thời hạn bảo hành khác nhau
- Giá riêng cho Cộng tác viên và Khách lẻ
- Hỗ trợ gói "vĩnh viễn" (mặc định 2 năm)

### 👥 Quản lý khách hàng
- 2 loại khách hàng: Cộng Tác Viên và Khách Lẻ
- Theo dõi nguồn khách hàng (Facebook, Telegram, Page, Web, Zalo)
- Lưu thông tin chi tiết và ghi chú
- Xem lịch sử đơn hàng của từng khách hàng

### 🛒 Quản lý đơn hàng
- Tạo đơn hàng với thông tin đầy đủ
- Tự động tính ngày hết hạn dựa trên thời hạn gói
- Theo dõi trạng thái đơn hàng (Đang xử lý, Hoàn thành, Đã hủy)
- Tìm kiếm và lọc đơn hàng theo nhiều tiêu chí

### 📊 Báo cáo và xuất dữ liệu
- Xuất dữ liệu ra Excel và PDF
- Thống kê doanh thu và đơn hàng
- Báo cáo chi tiết theo thời gian

## Cài đặt và chạy ứng dụng

### Yêu cầu hệ thống
- Node.js 16+ 
- npm hoặc yarn

### Cài đặt
```bash
# Clone repository
git clone <repository-url>
cd BongMinApp

# Cài đặt dependencies
npm install

# Chạy ứng dụng
npm start
```

### Tài khoản
- Hãy tạo tài khoản quản trị đầu tiên của bạn sau khi khởi chạy

## Cấu trúc dự án

```
src/
├── components/          # Các component React
│   ├── Auth/           # Xác thực
│   ├── Layout/         # Layout chính
│   ├── Products/       # Quản lý sản phẩm
│   ├── Customers/      # Quản lý khách hàng
│   ├── Orders/         # Quản lý đơn hàng
│   ├── Employees/      # Quản lý nhân viên
│   ├── ActivityLogs/   # Lịch sử hoạt động
│   └── Export/         # Xuất dữ liệu
├── contexts/           # React Context
├── types/             # TypeScript types
├── utils/             # Utilities
│   ├── database.ts   # Database operations
│   └── export.ts     # Export functionality
└── App.tsx           # Component chính
```

## Tính năng chi tiết

### Quản lý sản phẩm
- ✅ Thêm, sửa, xóa sản phẩm
- ✅ Quản lý gói sản phẩm với giá khác nhau
- ✅ Thời hạn bảo hành linh hoạt
- ✅ Tìm kiếm và lọc sản phẩm

### Quản lý khách hàng
- ✅ Thêm, sửa, xóa khách hàng
- ✅ Phân loại khách hàng (CTV/Khách lẻ)
- ✅ Theo dõi nguồn khách hàng
- ✅ Xem lịch sử đơn hàng

### Quản lý đơn hàng
- ✅ Tạo đơn hàng mới
- ✅ Tự động tính ngày hết hạn
- ✅ Theo dõi trạng thái đơn hàng
- ✅ Tìm kiếm và lọc đơn hàng
- ✅ Thống kê doanh thu

### Hệ thống phân quyền
- ✅ Đăng nhập/đăng xuất
- ✅ Phân quyền theo vai trò
- ✅ Lưu lịch sử hoạt động
- ✅ Quản lý nhân viên (chỉ quản lý)

### Xuất dữ liệu
- ✅ Xuất Excel cho tất cả danh sách
- ✅ Xuất PDF cho đơn hàng và khách hàng
- ✅ Định dạng tiếng Việt

## Công nghệ sử dụng

- **Frontend:** React 18 + TypeScript
- **Styling:** CSS3 với responsive design
- **State Management:** React Context + Hooks
- **Database:** LocalStorage (có thể nâng cấp lên real database)
- **Export:** xlsx, jspdf
- **Build Tool:** Create React App

## Hướng dẫn sử dụng

### 1. Đăng nhập
- Đăng nhập bằng tài khoản bạn đã tạo
- Tài khoản quản lý có đầy đủ quyền
- Tài khoản nhân viên có quyền hạn chế

### 2. Quản lý sản phẩm
- Vào tab "Sản phẩm" để quản lý danh sách sản phẩm
- Vào tab "Gói sản phẩm" để quản lý các gói của sản phẩm
- Thiết lập giá cho từng loại khách hàng

### 3. Quản lý khách hàng
- Vào tab "Khách hàng" để quản lý danh sách khách hàng
- Phân loại khách hàng và theo dõi nguồn
- Xem lịch sử đơn hàng của từng khách

### 4. Tạo đơn hàng
- Vào tab "Đơn hàng" để quản lý đơn hàng
- Tạo đơn hàng mới với thông tin đầy đủ
- Hệ thống tự động tính ngày hết hạn

### 5. Xuất báo cáo
- Sử dụng nút "Xuất dữ liệu" trên mỗi trang
- Chọn định dạng Excel hoặc PDF
- File sẽ được tải về máy tính

## Lưu ý quan trọng

- Dữ liệu được lưu trong LocalStorage của trình duyệt
- Để backup dữ liệu, có thể xuất ra Excel/PDF
- Ứng dụng hoạt động offline hoàn toàn
- Có thể nâng cấp lên database thật khi cần thiết

## Hỗ trợ

Nếu gặp vấn đề, vui lòng liên hệ qua:
- Email: support@bongminapp.com
- Hotline: 0123-456-789

## License

© 2024 BongMin App. All rights reserved.

