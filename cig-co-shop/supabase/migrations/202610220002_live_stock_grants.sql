-- Live stock: let the Netlify functions (service_role) read and update stock.
-- 202610220001_live_stock.sql revoked access from public/anon/authenticated but
-- never granted it to service_role, so /.netlify/functions/stock returned 503
-- and paid mask orders couldn't decrement stock. Already applied in production
-- on 2026-10-22. GRANT is idempotent, so this is safe to run more than once.
grant select, insert, update, delete on public.live_stock, public.live_stock_orders to service_role;
grant execute on function public.cigco_get_live_stock() to service_role;
grant execute on function public.cigco_commit_stock_order(text, jsonb) to service_role;
