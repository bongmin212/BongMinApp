-- Migration: Cleanup unused RPC functions and redundant policies
-- This removes RPC functions that are not used in the codebase
-- and simplifies RLS policies to match the direct approach

-- Drop unused RPC functions
DROP FUNCTION IF EXISTS rpc_link_order_inventory(uuid, uuid, text[], timestamptz);
DROP FUNCTION IF EXISTS rpc_unlink_order_inventory(uuid, uuid);

-- Drop redundant policies from migration_inventory_policies_alternative
-- These are duplicates of the standard policies in reset.sql
DROP POLICY IF EXISTS "Allow authenticated users to update inventory profiles" ON inventory;
DROP POLICY IF EXISTS "Allow authenticated users to update inventory status" ON inventory;

-- Note: Keep only the standard policies from reset.sql:
-- - inventory_read_all (allow all authenticated)
-- - inventory_insert_all (allow all authenticated)  
-- - inventory_update_all (allow all authenticated)
-- - inventory_delete_manager_only (manager only)
