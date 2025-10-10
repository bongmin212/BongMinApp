-- Use inventory purchase price as the single COGS source
-- Snapshot into orders.cogs when linking inventory

-- 1) Inventory metadata (safe-add)
alter table if exists public.inventory
  add column if not exists supplier_name text,
  add column if not exists supplier_id uuid,
  add column if not exists purchase_price numeric(12,2),
  add column if not exists currency text default 'VND';

-- 2) Orders.cogs snapshot (safe-add)
alter table if exists public.orders
  add column if not exists cogs numeric(12,2);

-- 3) Trigger: copy inventory.purchase_price -> orders.cogs on link
-- For multi-slot accounts, divide purchase_price by total_slots
create or replace function public.set_order_cogs_from_inventory()
returns trigger language plpgsql as $$
declare
  inv_purchase_price numeric(12,2);
  inv_total_slots integer;
  inv_is_account_based boolean;
begin
  if new.inventory_item_id is not null then
    select i.purchase_price, i.total_slots, i.is_account_based
    into inv_purchase_price, inv_total_slots, inv_is_account_based
    from public.inventory i
    where i.id = new.inventory_item_id;
    
    if inv_purchase_price is not null then
      if inv_is_account_based and inv_total_slots > 0 then
        -- Multi-slot account: divide purchase price by total slots
        new.cogs := inv_purchase_price / inv_total_slots;
      else
        -- Single item: use full purchase price
        new.cogs := inv_purchase_price;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_cogs on public.orders;
create trigger trg_orders_set_cogs
before insert or update of inventory_item_id on public.orders
for each row execute function public.set_order_cogs_from_inventory();

-- 4) Backfill existing orders.cogs (with slot division for multi-slot accounts)
update public.orders o
set cogs = case 
  when i.is_account_based and i.total_slots > 0 then i.purchase_price / i.total_slots
  else i.purchase_price
end
from public.inventory i
where o.inventory_item_id = i.id
  and (o.cogs is null or o.cogs = 0)
  and i.purchase_price is not null;


