import { defineEventHandler } from 'nuxt/server';

import { marketRecipeService } from '~~/server/services/market/recipes';

import { marketAdminRecipesQuery } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  const query = parseQuery(event, marketAdminRecipesQuery);
  return marketRecipeService.list(query.item, query.uses);
});
