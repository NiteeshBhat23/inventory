-- Lets an owner dismiss an item from the low-stock alert without archiving
-- it or touching its cost/stock history — for the "sold out and I'm not
-- reordering this one" case. Purchasing the item again clears the flag
-- automatically (see purchases_service.commit_purchase_batch), since a
-- restock is itself the signal that tracking should resume.
ALTER TABLE items ADD COLUMN IF NOT EXISTS wont_restock BOOLEAN NOT NULL DEFAULT false;
