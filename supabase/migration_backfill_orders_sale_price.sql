-- Backfill sale_price for existing orders
-- Logic: use custom_price when use_custom_price = true
-- else pick CTV or Retail price from packages based on customer.type

update public.orders o
set sale_price = case
  when coalesce(o.use_custom_price, false) is true then coalesce(o.custom_price, 0)
  else case when c.type = 'CTV'
            then coalesce((select p.ctv_price from public.packages p where p.id = o.package_id), 0)
            else coalesce((select p.retail_price from public.packages p where p.id = o.package_id), 0)
       end
end
from public.customers c
where o.customer_id = c.id
  and o.sale_price is null;


