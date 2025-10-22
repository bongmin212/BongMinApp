-- Migration: Atomic inventory assignment function
-- Run this in Supabase SQL editor

-- Function to atomically assign inventory to order
CREATE OR REPLACE FUNCTION assign_inventory_to_order(
  p_order_id UUID,
  p_inventory_id UUID,
  p_profile_ids TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  inv_record RECORD;
  profile_record RECORD;
  updated_profiles JSONB;
  all_occupied BOOLEAN;
  success BOOLEAN := FALSE;
BEGIN
  -- Start transaction
  BEGIN
    -- Lock the inventory row for update to prevent race conditions
    SELECT * INTO inv_record
    FROM public.inventory
    WHERE id = p_inventory_id
    FOR UPDATE;
    
    -- Check if inventory exists
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
    
    -- Handle account-based inventory
    IF inv_record.is_account_based THEN
      -- Check if profiles array exists and is valid
      IF inv_record.profiles IS NULL OR jsonb_typeof(inv_record.profiles) != 'array' THEN
        RETURN FALSE;
      END IF;
      
      -- Check if profile_ids are provided
      IF p_profile_ids IS NULL OR array_length(p_profile_ids, 1) = 0 THEN
        RETURN FALSE;
      END IF;
      
      -- Initialize updated_profiles with current profiles
      updated_profiles := inv_record.profiles;
      
      -- Check each requested profile and update if available
      FOR i IN 1..array_length(p_profile_ids, 1) LOOP
        -- Find the profile in the array
        FOR j IN 1..jsonb_array_length(updated_profiles) LOOP
          profile_record := jsonb_array_element(updated_profiles, j-1);
          
          -- Check if this is the profile we want to assign
          IF (profile_record->>'id')::TEXT = p_profile_ids[i] THEN
            -- Check if profile is already assigned to a different order
            IF (profile_record->>'isAssigned')::BOOLEAN = TRUE 
               AND (profile_record->>'assignedOrderId')::TEXT != p_order_id::TEXT THEN
              RETURN FALSE; -- Profile already assigned to different order
            END IF;
            
            -- Check if profile needs update
            IF (profile_record->>'needsUpdate')::BOOLEAN = TRUE THEN
              RETURN FALSE; -- Profile needs update, cannot assign
            END IF;
            
            -- Update the profile to assigned state
            updated_profiles := jsonb_set(
              updated_profiles,
              ARRAY[j-1::TEXT],
              profile_record || jsonb_build_object(
                'isAssigned', true,
                'assignedOrderId', p_order_id::TEXT,
                'assignedAt', NOW()::TEXT,
                'expiryAt', (SELECT expiry_date FROM public.orders WHERE id = p_order_id)::TEXT
              )
            );
          END IF;
        END LOOP;
      END LOOP;
      
      -- Check if all slots are now occupied
      all_occupied := TRUE;
      FOR i IN 1..jsonb_array_length(updated_profiles) LOOP
        profile_record := jsonb_array_element(updated_profiles, i-1);
        IF (profile_record->>'isAssigned')::BOOLEAN = FALSE 
           AND (profile_record->>'needsUpdate')::BOOLEAN = FALSE THEN
          all_occupied := FALSE;
          EXIT;
        END IF;
      END LOOP;
      
      -- Update inventory with new profiles and status
      UPDATE public.inventory
      SET 
        profiles = updated_profiles,
        status = CASE WHEN all_occupied THEN 'SOLD' ELSE 'AVAILABLE' END,
        version = version + 1
      WHERE id = p_inventory_id;
      
      success := TRUE;
      
    ELSE
      -- Handle classic inventory (non-account-based)
      -- Check if inventory is available and not linked to another order
      IF inv_record.status != 'AVAILABLE' OR inv_record.linked_order_id IS NOT NULL THEN
        RETURN FALSE;
      END IF;
      
      -- Update inventory to SOLD and link to order
      UPDATE public.inventory
      SET 
        status = 'SOLD',
        linked_order_id = p_order_id,
        version = version + 1
      WHERE id = p_inventory_id;
      
      success := TRUE;
    END IF;
    
    RETURN success;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error and return false
      RAISE WARNING 'Error in assign_inventory_to_order: %', SQLERRM;
      RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to release inventory from order
CREATE OR REPLACE FUNCTION release_inventory_from_order(
  p_order_id UUID,
  p_inventory_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  inv_record RECORD;
  updated_profiles JSONB;
  profile_record RECORD;
  all_occupied BOOLEAN;
  success BOOLEAN := FALSE;
BEGIN
  BEGIN
    -- If inventory_id is provided, release specific inventory
    IF p_inventory_id IS NOT NULL THEN
      -- Lock the inventory row
      SELECT * INTO inv_record
      FROM public.inventory
      WHERE id = p_inventory_id
      FOR UPDATE;
      
      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;
      
      -- Handle account-based inventory
      IF inv_record.is_account_based THEN
        updated_profiles := inv_record.profiles;
        
        -- Release all profiles assigned to this order
        FOR i IN 1..jsonb_array_length(updated_profiles) LOOP
          profile_record := jsonb_array_element(updated_profiles, i-1);
          
          IF (profile_record->>'assignedOrderId')::TEXT = p_order_id::TEXT THEN
            updated_profiles := jsonb_set(
              updated_profiles,
              ARRAY[i-1::TEXT],
              profile_record || jsonb_build_object(
                'isAssigned', false,
                'assignedOrderId', null,
                'assignedAt', null,
                'expiryAt', null
              )
            );
          END IF;
        END LOOP;
        
        -- Check if all slots are now free
        all_occupied := TRUE;
        FOR i IN 1..jsonb_array_length(updated_profiles) LOOP
          profile_record := jsonb_array_element(updated_profiles, i-1);
          IF (profile_record->>'isAssigned')::BOOLEAN = FALSE 
             AND (profile_record->>'needsUpdate')::BOOLEAN = FALSE THEN
            all_occupied := FALSE;
            EXIT;
          END IF;
        END LOOP;
        
        -- Update inventory
        UPDATE public.inventory
        SET 
          profiles = updated_profiles,
          status = CASE WHEN all_occupied THEN 'SOLD' ELSE 'AVAILABLE' END,
          version = version + 1
        WHERE id = p_inventory_id;
        
      ELSE
        -- Handle classic inventory
        IF inv_record.linked_order_id = p_order_id THEN
          UPDATE public.inventory
          SET 
            status = 'AVAILABLE',
            linked_order_id = NULL,
            version = version + 1
          WHERE id = p_inventory_id;
        END IF;
      END IF;
      
      success := TRUE;
      
    ELSE
      -- Release all inventory linked to this order
      -- Classic inventory
      UPDATE public.inventory
      SET 
        status = 'AVAILABLE',
        linked_order_id = NULL,
        version = version + 1
      WHERE linked_order_id = p_order_id;
      
      -- Account-based inventory
      FOR inv_record IN 
        SELECT * FROM public.inventory 
        WHERE is_account_based = TRUE 
        AND profiles IS NOT NULL
        FOR UPDATE
      LOOP
        updated_profiles := inv_record.profiles;
        
        -- Release all profiles assigned to this order
        FOR i IN 1..jsonb_array_length(updated_profiles) LOOP
          profile_record := jsonb_array_element(updated_profiles, i-1);
          
          IF (profile_record->>'assignedOrderId')::TEXT = p_order_id::TEXT THEN
            updated_profiles := jsonb_set(
              updated_profiles,
              ARRAY[i-1::TEXT],
              profile_record || jsonb_build_object(
                'isAssigned', false,
                'assignedOrderId', null,
                'assignedAt', null,
                'expiryAt', null
              )
            );
          END IF;
        END LOOP;
        
        -- Check if all slots are now free
        all_occupied := TRUE;
        FOR i IN 1..jsonb_array_length(updated_profiles) LOOP
          profile_record := jsonb_array_element(updated_profiles, i-1);
          IF (profile_record->>'isAssigned')::BOOLEAN = FALSE 
             AND (profile_record->>'needsUpdate')::BOOLEAN = FALSE THEN
            all_occupied := FALSE;
            EXIT;
          END IF;
        END LOOP;
        
        -- Update inventory
        UPDATE public.inventory
        SET 
          profiles = updated_profiles,
          status = CASE WHEN all_occupied THEN 'SOLD' ELSE 'AVAILABLE' END,
          version = version + 1
        WHERE id = inv_record.id;
      END LOOP;
      
      success := TRUE;
    END IF;
    
    RETURN success;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in release_inventory_from_order: %', SQLERRM;
      RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to check inventory availability
CREATE OR REPLACE FUNCTION check_inventory_availability(
  p_inventory_id UUID,
  p_profile_ids TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  inv_record RECORD;
  profile_record RECORD;
  available_count INTEGER := 0;
BEGIN
  -- Get inventory record
  SELECT * INTO inv_record
  FROM public.inventory
  WHERE id = p_inventory_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Handle account-based inventory
  IF inv_record.is_account_based THEN
    -- Check if profiles array exists
    IF inv_record.profiles IS NULL OR jsonb_typeof(inv_record.profiles) != 'array' THEN
      RETURN FALSE;
    END IF;
    
    -- If specific profile_ids requested, check each one
    IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) > 0 THEN
      FOR i IN 1..array_length(p_profile_ids, 1) LOOP
        -- Find the profile in the array
        FOR j IN 1..jsonb_array_length(inv_record.profiles) LOOP
          profile_record := jsonb_array_element(inv_record.profiles, j-1);
          
          IF (profile_record->>'id')::TEXT = p_profile_ids[i] THEN
            -- Check if profile is available
            IF (profile_record->>'isAssigned')::BOOLEAN = FALSE 
               AND (profile_record->>'needsUpdate')::BOOLEAN = FALSE THEN
              available_count := available_count + 1;
            ELSE
              RETURN FALSE; -- This specific profile is not available
            END IF;
          END IF;
        END LOOP;
      END LOOP;
      
      -- Return true if all requested profiles are available
      RETURN available_count = array_length(p_profile_ids, 1);
    ELSE
      -- Check if any profile is available
      FOR i IN 1..jsonb_array_length(inv_record.profiles) LOOP
        profile_record := jsonb_array_element(inv_record.profiles, i-1);
        
        IF (profile_record->>'isAssigned')::BOOLEAN = FALSE 
           AND (profile_record->>'needsUpdate')::BOOLEAN = FALSE THEN
          RETURN TRUE; -- At least one profile is available
        END IF;
      END LOOP;
      
      RETURN FALSE; -- No profiles available
    END IF;
    
  ELSE
    -- Handle classic inventory
    RETURN inv_record.status = 'AVAILABLE' AND inv_record.linked_order_id IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;
