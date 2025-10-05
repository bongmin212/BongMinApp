-- Migration: Add inventory_profile_id column to orders table
-- Run this in Supabase SQL editor

-- Add inventory_profile_id column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS inventory_profile_id text;

-- Add comment for clarity
COMMENT ON COLUMN public.orders.inventory_profile_id IS 'Profile ID for account-based inventory items';
