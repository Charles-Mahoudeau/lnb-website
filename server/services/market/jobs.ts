import { lt } from 'drizzle-orm';

import { db } from '~~/server/db';
import { marketItem, marketSale, marketSnapshot } from '~~/server/db/schema';

import { DAY_MS, priceNow, stockNow } from './shared';

/** One row per enabled item: the price and the (drifted) stock now, for the charts. */
async function snapshot(now = new Date()): Promise<{ items: number }> {
  const rows = await db.select().from(marketItem);
  const enabled = rows.filter((row) => row.enabled);
  for (let from = 0; from < enabled.length; from += 500) {
    await db.insert(marketSnapshot).values(
      enabled.slice(from, from + 500).map((row) => ({
        itemId: row.id,
        price: priceNow(row, now),
        stock: stockNow(row, now),
        at: now,
      })),
    );
  }
  return { items: enabled.length };
}

/** Forgets what is older than the history setting; sales older than the window are useless. */
async function prune(historyDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - historyDays * DAY_MS);
  const snapshots = await db
    .delete(marketSnapshot)
    .where(lt(marketSnapshot.at, cutoff))
    .returning({ id: marketSnapshot.id });
  const sales = await db
    .delete(marketSale)
    .where(lt(marketSale.createdAt, new Date(now.getTime() - 2 * DAY_MS)))
    .returning({ id: marketSale.id });
  return { snapshots: snapshots.length, sales: sales.length };
}

export const marketJobs = { snapshot, prune };
