-- Add custom_warranty_months column to inventory table for shared pool warehouses
-- This allows warehouses with shared product pools to have custom warranty durations

ALTER TABLE inventory 
ADD COLUMN custom_warranty_months INTEGER;

-- Add comment to explain the column purpose
COMMENT ON COLUMN inventory.custom_warranty_months IS 'Custom warranty duration in months for shared pool warehouses. Only used when product has shared_inventory_pool = true.';

-- Add check constraint to ensure positive values
ALTER TABLE inventory 
ADD CONSTRAINT check_custom_warranty_months_positive 
CHECK (custom_warranty_months IS NULL OR custom_warranty_months > 0);
