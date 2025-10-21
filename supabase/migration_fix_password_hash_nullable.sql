-- Migration: Fix password_hash field to be NOT NULL
-- Run this in Supabase SQL editor

-- First, update any existing records with NULL password_hash
-- Set a placeholder value for existing records (they should be updated via proper auth flow)
UPDATE public.employees 
SET password_hash = 'PLACEHOLDER_MUST_CHANGE'
WHERE password_hash IS NULL;

-- Add NOT NULL constraint to password_hash field
ALTER TABLE public.employees 
ALTER COLUMN password_hash SET NOT NULL;

-- Add a check constraint to prevent placeholder values in production
-- This ensures password_hash is not empty or placeholder
ALTER TABLE public.employees 
ADD CONSTRAINT password_hash_not_empty 
CHECK (password_hash IS NOT NULL AND LENGTH(TRIM(password_hash)) > 0);
