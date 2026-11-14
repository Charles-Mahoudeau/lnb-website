<script setup lang="ts">
import type { GamesplanetAdminGame } from '#shared/schemas/gamesplanet';

// The "Gamesplanet offer" section of the event form: a switch, then the game, found by name or by
// pasting a Gamesplanet or Steam link. Only the game's uid is kept on the event.
const props = defineProps<{
  /** The uid kept on the event, even when its game has left the catalog. */
  uid: string | null;
  game: GamesplanetAdminGame | null;
}>();
const emit = defineEmits<{ change: [game: GamesplanetAdminGame | null] }>();

const { t, locale } = useI18n();
const toast = useToast();

// On with a game chosen, or while one is being chosen.
const choosing = ref(false);
const on = computed(() => props.uid !== null || choosing.value);

const query = ref('');
const results = ref<GamesplanetAdminGame[]>([]);
const searched = ref(false);
const searching = ref(false);

async function search() {
  if (query.value.trim().length < 2) return;
  searching.value = true;
  try {
    results.value = (await searchGamesplanetForEvent(query.value.trim())).games;
    searched.value = true;
  } catch {
    toast.add({
      title: t('admin.events.form.gamesplanet.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  searching.value = false;
}

function choose(game: GamesplanetAdminGame) {
  emit('change', game);
  choosing.value = false;
  query.value = '';
  results.value = [];
  searched.value = false;
}

function replace() {
  emit('change', null);
  choosing.value = true;
}

function toggle(value: boolean) {
  if (value) {
    choosing.value = true;
  } else {
    choosing.value = false;
    emit('change', null);
  }
}
</script>

<template>
  <section class="flex flex-col gap-5 rounded-lg bg-elevated p-5">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <IconTile icon="i-lucide-gamepad-2" />
        <div class="flex flex-col">
          <h2 class="text-lg font-bold text-highlighted">
            {{ t('admin.events.form.gamesplanet.title') }}
          </h2>
          <p class="text-sm text-muted">{{ t('admin.events.form.gamesplanet.help') }}</p>
        </div>
      </div>
      <USwitch
        :model-value="on"
        :aria-label="t('admin.events.form.gamesplanet.title')"
        @update:model-value="toggle"
      />
    </div>

    <template v-if="on">
      <div v-if="uid" class="flex flex-wrap items-center gap-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <span v-if="game" class="truncate font-semibold text-highlighted">{{ game.name }}</span>
          <span v-else class="text-warning">
            {{ t('admin.events.form.gamesplanet.gone') }}
          </span>
          <span v-if="game" class="text-sm text-muted">
            {{ formatEuros(game.priceCents, locale) }}
            <template v-if="game.discountPercent !== null">, −{{ game.discountPercent }}%</template>
          </span>
        </div>
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          :label="t('admin.events.form.gamesplanet.change')"
          @click="replace"
        />
      </div>

      <template v-else>
        <div class="flex flex-wrap items-start gap-3">
          <UFormField
            :label="t('admin.events.form.gamesplanet.search')"
            name="gamesplanetSearch"
            :help="t('admin.events.form.gamesplanet.searchHelp')"
            class="min-w-64 flex-1"
          >
            <UInput
              v-model="query"
              :maxlength="300"
              class="w-full"
              @keydown.enter.prevent="search"
            />
          </UFormField>
          <UButton
            type="button"
            color="neutral"
            variant="soft"
            class="mt-6"
            :loading="searching"
            :disabled="query.trim().length < 2"
            :label="t('admin.events.form.gamesplanet.searchButton')"
            @click="search"
          />
        </div>
        <p v-if="searched && !results.length" class="text-sm text-muted">
          {{ t('admin.events.form.gamesplanet.noResult') }}
        </p>
        <ul v-if="results.length" class="flex flex-col divide-y divide-default">
          <li v-for="found in results" :key="found.uid" class="flex items-center gap-3 py-3">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold text-highlighted">{{ found.name }}</span>
              <span class="text-sm text-muted">{{ formatEuros(found.priceCents, locale) }}</span>
            </div>
            <UButton
              type="button"
              color="neutral"
              variant="soft"
              :label="t('admin.events.form.gamesplanet.choose')"
              @click="choose(found)"
            />
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>
