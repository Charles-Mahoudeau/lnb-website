import { defineTask } from 'nitropack/runtime';

import { db } from '~~/server/db';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyAuctionService } from '~~/server/services/economy/auctions';
import { economyStatsService } from '~~/server/services/economy/stats';
import { flagService } from '~~/server/services/flags';

// Every night: closes the bank accounts of deleted players (in case a deletion went around
// usersService), ends expired auction listings (reads end them too), then writes the closed days
// of the admin charts. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'economy:snapshot',
    description: 'Close orphaned bank accounts and save the daily economy stats',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.economySnapshot')))
      return { result: { skipped: true } };
    const swept = await db.transaction((tx) => economyAccountService.sweepOrphans(tx));
    const expired = await economyAuctionService.expireDue(db);
    const days = await economyStatsService.snapshot();
    return { result: { ...swept, expired, days, skipped: false } };
  },
});
