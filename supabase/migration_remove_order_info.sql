-- Migration: Remove order_info and new_order_info columns
-- Run this in Supabase SQL editor

-- Drop order_info column from orders table
ALTER TABLE public.orders 
DROP COLUMN IF EXISTS order_info;

-- Drop new_order_info column from warranties table
ALTER TABLE public.warranties 
DROP COLUMN IF EXISTS new_order_info;

