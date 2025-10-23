# Test Slot Linking Fix - Complete Migration

## Vấn đề đã sửa:
1. **Migration hoàn chỉnh**: Migrate tất cả data từ `inventory_profile_id` (text) sang `inventory_profile_ids` (jsonb)
2. **Code cleanup**: Loại bỏ backward compatibility, chỉ sử dụng `inventoryProfileIds` (jsonb array)
3. **Database schema**: Drop cột cũ sau khi migration xong

## Các thay đổi chính:

### Database Migration:
- **migration_complete_profile_id_migration.sql**: Migrate tất cả data từ cột cũ sang cột mới
- Drop cột `inventory_profile_id` sau khi migration xong
- Chỉ sử dụng `inventory_profile_ids` (jsonb array)

### Code Changes:
- **OrderForm.tsx**: Loại bỏ logic backward compatibility, chỉ sử dụng `inventoryProfileIds`
- **Tất cả file load orders**: Loại bỏ `inventoryProfileId` field
- **Types**: Loại bỏ `inventoryProfileId` từ Order interface

## Test cases cần kiểm tra:
1. ✅ Edit đơn hàng có `inventoryProfileIds` (jsonb array)
2. ✅ Tạo đơn hàng mới với kho slot
3. ✅ Update đơn hàng với multiple slots
4. ✅ Migration data từ cột cũ sang cột mới

## Database schema sau migration:
- ❌ `inventory_profile_id` (text) - đã drop
- ✅ `inventory_profile_ids` (jsonb) - chỉ sử dụng cột này

## Migration steps:
1. Chạy migration SQL để migrate data
2. Verify migration completed
3. Drop cột cũ
4. Deploy code mới