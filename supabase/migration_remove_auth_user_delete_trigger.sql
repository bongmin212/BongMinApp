-- Migration: Remove auth user delete trigger completely
-- Run this in Supabase SQL editor

-- Step 1: Drop the trigger first
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

-- Step 2: Drop both old and new functions
DROP FUNCTION IF EXISTS public.handle_delete_auth_user();
DROP FUNCTION IF EXISTS public.handle_auth_user_deleted();
