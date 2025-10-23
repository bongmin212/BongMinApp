-- Script to fix existing inventory profiles based on orders.inventory_profile_ids
-- This will sync inventory.profiles with orders.inventory_profile_ids for existing data

-- First, let's see what we have
SELECT 
  'BEFORE FIX' as status,
  COUNT(*) as total_account_based,
  COUNT(CASE WHEN profiles IS NULL OR jsonb_array_length(profiles) = 0 THEN 1 END) as empty_profiles,
  COUNT(CASE WHEN profiles IS NOT NULL AND jsonb_array_length(profiles) > 0 THEN 1 END) as has_profiles
FROM inventory 
WHERE is_account_based = true;

-- Function to fix inventory profiles based on orders
CREATE OR REPLACE FUNCTION fix_inventory_profiles_from_orders()
RETURNS TABLE(
  inventory_id uuid,
  inventory_code text,
  total_slots integer,
  fixed_profiles jsonb,
  linked_orders_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  inv_record RECORD;
  order_record RECORD;
  updated_profiles jsonb;
  profile jsonb;
  slot_id text;
  linked_count integer;
BEGIN
  -- Loop through all account-based inventory items
  FOR inv_record IN 
    SELECT id, code, total_slots, profiles
    FROM inventory 
    WHERE is_account_based = true
  LOOP
    -- Initialize profiles array
    updated_profiles := '[]'::jsonb;
    linked_count := 0;
    
    -- Generate base profiles
    FOR i IN 1..COALESCE(inv_record.total_slots, 0) LOOP
      slot_id := 'slot-' || i;
      
      -- Check if this slot is linked to any order
      SELECT COUNT(*) INTO linked_count
      FROM orders 
      WHERE inventory_profile_ids IS NOT NULL 
        AND jsonb_array_length(inventory_profile_ids) > 0
        AND inventory_profile_ids ? slot_id;
      
      -- Create profile
      profile := jsonb_build_object(
        'id', slot_id,
        'label', 'Slot ' || i,
        'isAssigned', linked_count > 0,
        'assignedOrderId', CASE WHEN linked_count > 0 THEN 
          (SELECT id FROM orders 
           WHERE inventory_profile_ids IS NOT NULL 
             AND inventory_profile_ids ? slot_id 
           LIMIT 1) 
        ELSE NULL END,
        'assignedAt', CASE WHEN linked_count > 0 THEN now() ELSE NULL END,
        'expiryAt', CASE WHEN linked_count > 0 THEN 
          (SELECT expiry_date FROM orders 
           WHERE inventory_profile_ids IS NOT NULL 
             AND inventory_profile_ids ? slot_id 
           LIMIT 1) 
        ELSE NULL END
      );
      
      updated_profiles := updated_profiles || jsonb_build_array(profile);
    END LOOP;
    
    -- Update the inventory item
    UPDATE inventory 
    SET 
      profiles = updated_profiles,
      status = CASE 
        WHEN jsonb_array_length(updated_profiles) = 0 THEN 'AVAILABLE'
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements(updated_profiles) p 
          WHERE (p->>'isAssigned')::boolean = false 
            AND (p->>'needsUpdate')::boolean IS DISTINCT FROM true
        ) THEN 'AVAILABLE'
        ELSE 'SOLD'
      END,
      updated_at = now()
    WHERE id = inv_record.id;
    
    -- Return the result
    inventory_id := inv_record.id;
    inventory_code := inv_record.code;
    total_slots := inv_record.total_slots;
    fixed_profiles := updated_profiles;
    linked_orders_count := (
      SELECT COUNT(*) FROM orders 
      WHERE inventory_profile_ids IS NOT NULL 
        AND jsonb_array_length(inventory_profile_ids) > 0
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(inventory_profile_ids) slot_id
          WHERE slot_id LIKE 'slot-%' 
            AND slot_id::text IN (
              SELECT jsonb_array_elements_text(updated_profiles)->>'id'
            )
        )
    );
    
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Run the fix
SELECT * FROM fix_inventory_profiles_from_orders();

-- Check results
SELECT 
  'AFTER FIX' as status,
  COUNT(*) as total_account_based,
  COUNT(CASE WHEN profiles IS NULL OR jsonb_array_length(profiles) = 0 THEN 1 END) as empty_profiles,
  COUNT(CASE WHEN profiles IS NOT NULL AND jsonb_array_length(profiles) > 0 THEN 1 END) as has_profiles
FROM inventory 
WHERE is_account_based = true;

-- Clean up
DROP FUNCTION fix_inventory_profiles_from_orders();
