-- Inventory & Cost Management App — Phase 1 schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query) once,
-- after creating your Supabase project.

create extension if not exists "uuid-ossp";

-- One row per signed-up owner. id == auth.users.id (1 shop per owner in Phase 1).
create table if not exists shops (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  default_target_margin_pct numeric not null default 20,
  default_low_stock_threshold numeric not null default 5,
  created_at timestamptz not null default now()
);

create table if not exists items (
  item_id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  canonical_name text not null,
  aliases text[] not null default '{}',
  unit text not null default 'piece',
  avg_cost numeric not null default 0,
  stock_qty numeric not null default 0,
  selling_price numeric not null default 0,
  target_margin_pct numeric,
  category text,
  low_stock_threshold numeric,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_items_shop on items(shop_id);

create table if not exists purchase_history (
  purchase_id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(item_id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  supplier_name text,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price > 0),
  total_price numeric not null,
  purchase_date date not null,
  avg_cost_after numeric not null,
  source text not null default 'manual' check (source in ('manual', 'upload')),
  created_at timestamptz not null default now()
);
create index if not exists idx_purchase_shop on purchase_history(shop_id);
create index if not exists idx_purchase_item on purchase_history(item_id);

create table if not exists sale_records (
  sale_id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(item_id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  sale_price numeric not null,
  cost_at_sale numeric not null,
  profit numeric not null,
  source text not null default 'manual' check (source in ('manual', 'upload')),
  sold_below_cost boolean not null default false,
  customer_name text,
  invoice_ref text,
  sale_date timestamptz not null default now()
);
create index if not exists idx_sale_shop on sale_records(shop_id);
create index if not exists idx_sale_item on sale_records(item_id);

-- Composite indexes matching the app's actual filter+sort patterns (see
-- migrations/001_performance_indexes.sql). Every hot query filters on
-- shop_id AND a date, then sorts by that date.
create index if not exists idx_sale_shop_date on sale_records (shop_id, sale_date desc);
create index if not exists idx_purchase_shop_created on purchase_history (shop_id, created_at desc);
create index if not exists idx_purchase_item_date on purchase_history (item_id, purchase_date desc);
create index if not exists idx_items_shop_active_name on items (shop_id, canonical_name) where is_archived = false;

-- Row-Level Security: every table scoped by shop_id === the authenticated user.
alter table shops enable row level security;
alter table items enable row level security;
alter table purchase_history enable row level security;
alter table sale_records enable row level security;

create policy "shop owner reads/writes own shop" on shops
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "shop owner reads/writes own items" on items
  for all using (shop_id = auth.uid()) with check (shop_id = auth.uid());

create policy "shop owner reads/writes own purchases" on purchase_history
  for all using (shop_id = auth.uid()) with check (shop_id = auth.uid());

create policy "shop owner reads/writes own sales" on sale_records
  for all using (shop_id = auth.uid()) with check (shop_id = auth.uid());

-- Note: the FastAPI backend connects with the Postgres service-role connection
-- string (bypasses RLS) and enforces shop_id scoping in application code from
-- the verified JWT (see app/auth.py) — RLS here is defense-in-depth in case
-- anything ever queries Supabase directly (e.g. future client-side reads).
