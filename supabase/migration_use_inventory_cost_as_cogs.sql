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
create or replace function public.set_order_cogs_from_inventory()
returns trigger language plpgsql as $$
begin
  if new.inventory_item_id is not null then
    select i.purchase_price into new.cogs
    from public.inventory i
    where i.id = new.inventory_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_cogs on public.orders;
create trigger trg_orders_set_cogs
before insert or update of inventory_item_id on public.orders
for each row execute function public.set_order_cogs_from_inventory();

-- 4) Backfill existing orders.cogs
update public.orders o
set cogs = i.purchase_price
from public.inventory i
where o.inventory_item_id = i.id
  and (o.cogs is null or o.cogs = 0);


