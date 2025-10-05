-- Migration: Add missing columns to orders table
-- Run this in Supabase SQL editor

-- Add purchase_date column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS purchase_date timestamptz;

-- Add status column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'PROCESSING';

-- Add use_custom_price column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS use_custom_price boolean DEFAULT false;

-- Add custom_price column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS custom_price numeric DEFAULT 0;

-- Add custom_field_values column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS custom_field_values jsonb;

-- Update existing records with default values
UPDATE public.orders 
SET purchase_date = created_at,
    status = 'PROCESSING',
    use_custom_price = false,
    custom_price = 0,
    custom_field_values = '{}'::jsonb 
WHERE purchase_date IS NULL 
   OR status IS NULL 
   OR use_custom_price IS NULL 
   OR custom_price IS NULL 
   OR custom_field_values IS NULL;
