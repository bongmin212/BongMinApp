-- Migration: Convert inventory_profile_id from text to jsonb array
-- Run this in Supabase SQL editor

-- Add inventory_profile_ids column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS inventory_profile_ids jsonb;

-- Migrate existing data: convert single profile_id to array
UPDATE public.orders 
SET inventory_profile_ids = jsonb_build_array(inventory_profile_id)
WHERE inventory_profile_id IS NOT NULL AND inventory_profile_id != '';

-- Add comment for clarity
COMMENT ON COLUMN public.orders.inventory_profile_ids IS 'Array of profile IDs for multi-slot orders';

-- Note: Keep inventory_profile_id column for backward compatibility
-- To drop it later, run: ALTER TABLE public.orders DROP COLUMN inventory_profile_id;
