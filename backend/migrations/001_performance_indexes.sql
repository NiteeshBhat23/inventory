-- Composite indexes matching the app's actual filter+sort patterns.
--
-- The original schema indexed shop_id alone on every table. Every hot query
-- filters on shop_id AND a date, then sorts by that date — so Postgres could
-- use the index to find the shop's rows but still had to filter and sort the
-- whole set afterwards. These composites let it index-scan the exact range in
-- already-sorted order.
--
-- Safe to re-run: every statement is IF NOT EXISTS, and adding an index never
-- changes query results.

-- Dashboard/reports: WHERE shop_id = ? AND sale_date >= ? ORDER BY sale_date DESC
create index if not exists idx_sale_shop_date
  on sale_records (shop_id, sale_date desc);

-- Dashboard/reports/supplier drill-down:
--   WHERE shop_id = ? AND created_at >= ? ORDER BY created_at DESC
create index if not exists idx_purchase_shop_created
  on purchase_history (shop_id, created_at desc);

-- Item detail purchase history: WHERE item_id = ? AND shop_id = ?
--   ORDER BY purchase_date DESC
create index if not exists idx_purchase_item_date
  on purchase_history (item_id, purchase_date desc);

-- Item list and dashboard item load:
--   WHERE shop_id = ? AND is_archived = false ORDER BY canonical_name
-- Partial on the archived flag so the index only carries live rows.
create index if not exists idx_items_shop_active_name
  on items (shop_id, canonical_name)
  where is_archived = false;
