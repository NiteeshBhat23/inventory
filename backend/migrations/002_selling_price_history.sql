-- Selling-price change log, powering the Insights price-history chart.
--
-- Cost history needs no new table — purchase_history.avg_cost_after is
-- already a dated trail. Selling price has no equivalent: items.selling_price
-- only ever holds the current value. This table starts logging every change
-- from today forward; past changes were never captured and can't be
-- recovered.
--
-- Safe to re-run: create ... if not exists throughout.

create table if not exists selling_price_history (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(item_id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  old_price numeric,
  new_price numeric not null,
  source text not null default 'manual' check (source in ('manual', 'auto_on_purchase')),
  changed_at timestamptz not null default now()
);

create index if not exists idx_price_history_item_date
  on selling_price_history (item_id, changed_at desc);
create index if not exists idx_price_history_shop
  on selling_price_history (shop_id);

alter table selling_price_history enable row level security;

create policy "shop owner reads/writes own price history" on selling_price_history
  for all using (shop_id = auth.uid()) with check (shop_id = auth.uid());
