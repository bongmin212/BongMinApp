-- Migration: Add custom_fields column to packages table
-- Run this in Supabase SQL editor if the column doesn't exist

-- Add custom_fields column to packages table
ALTER TABLE public.packages 
ADD COLUMN IF NOT EXISTS custom_fields jsonb;

-- Update existing records to have empty array as default
UPDATE public.packages 
SET custom_fields = '[]'::jsonb 
WHERE custom_fields IS NULL;
