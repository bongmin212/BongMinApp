-- Fix expenses table schema to match frontend types
-- Run this in Supabase SQL editor

-- Add missing columns
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS type text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS date timestamptz;

-- Set default values for existing records
UPDATE public.expenses 
SET 
  type = 'OTHER',
  description = COALESCE(note, ''),
  date = created_at
WHERE type IS NULL OR description IS NULL OR date IS NULL;

-- Make required columns NOT NULL
ALTER TABLE public.expenses 
ALTER COLUMN type SET NOT NULL,
ALTER COLUMN date SET NOT NULL;

-- Drop old columns that are no longer needed
ALTER TABLE public.expenses 
DROP COLUMN IF EXISTS title,
DROP COLUMN IF EXISTS category,
DROP COLUMN IF EXISTS note;
