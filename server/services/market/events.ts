import { db } from '~~/server/db';
import { minecraftEventService } from '~~/server/services/minecraft-events';

import { loadConfig } from './shared';

// What lnb-economy hears about the Market on `GET /api/economy/server/events` (docs/market.md):
//
// - `market` { revision, items: [{ id, stock, at }] }: orders moved stocks. At most one a second,
//   with the latest stock of each item touched since the last one.
// - `market-config` { revision }: an item, a tier, a setting or the recipes changed.
//
// Recording an event never fails the change behind it: the mod also reads `/state` again.

const MIN_GAP_MS = 1000;

let pending = new Map<string, { id: string; stock: number; at: string }>();
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSentAt = 0;

/** Sends what orders changed since the last event. Called by the timer, and by tests. */
async function flush(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!pending.size) return;
  const items = [...pending.values()];
  pending = new Map();
  lastSentAt = Date.now();
  try {
    const { revision } = await loadConfig(db);
    await minecraftEventService.emit('economy', 'market', { revision, items });
  } catch (error) {
    console.error("Couldn't record a market event", error);
  }
}

/** An order set an item's stock. Coalesced: one event a second, whatever the number of orders. */
function stockChanged(id: string, stock: number, at: Date): void {
  pending.set(id, { id, stock, at: at.toISOString() });
  if (timer) return;
  timer = setTimeout(() => void flush(), Math.max(0, lastSentAt + MIN_GAP_MS - Date.now()));
  // A pending event must not keep the process alive.
  timer.unref();
}

/** The config changed: the mod reads `/state` again. Call it after the change is committed. */
async function configChanged(): Promise<void> {
  try {
    const { revision } = await loadConfig(db);
    await minecraftEventService.emit('economy', 'market-config', { revision });
  } catch (error) {
    console.error("Couldn't record a market-config event", error);
  }
}

export const marketEvents = { stockChanged, configChanged, flush };
