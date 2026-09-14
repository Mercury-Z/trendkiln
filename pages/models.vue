<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getModels } from '~/composables/useDemoStore'
import type { ModelItem, ModelKind } from '~/demo/db'

const KINDS = ['intelligence', 'coding_index', 'coding_cost', 'text_to_image', 'image_to_video'] as const

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isWatched, toggleWatch } = useWatchlist()

const kindFromQuery = () => {
  const requested = String(route.query.kind || 'intelligence')
  return (KINDS as readonly string[]).includes(requested) ? requested : 'intelligence'
}

const kind = ref<string>(kindFromQuery())
// On a prerendered page the router only adopts the real URL query after
// hydration, so keep the selection in sync with the route as well as pushing to it.
watch(() => route.query.kind, () => {
  kind.value = kindFromQuery()
})
watch(kind, (value) => {
  if (String(route.query.kind || 'intelligence') === value) return
  router.replace({ query: { ...route.query, kind: value } })
})

const data = computed(() => getModels(kind.value, 40))
const items = computed(() => data.value.items ?? [])
const source = computed(() => data.value.source)
const kindMeta = computed<ModelKind | undefined>(() => data.value.kindMeta)
const pending = ref(false)
const busy = ref<string | null>(null)

const kinds = computed<ModelKind[]>(() => {
  const list = data.value.kinds as ModelKind[] | undefined
  if (list?.length) return list
  return KINDS.map((id) => ({
    id,
    labelKey: `models.kinds.${id}`,
    higherIsBetter: id !== 'coding_cost',
    unit: id === 'coding_cost' ? 'usd' : id === 'coding_index' ? 'ratio' : id.includes('image') || id.includes('video') ? 'elo' : 'index',
    sourceUrl: '#',
  }))
})

const higherIsBetter = computed(() => kindMeta.value?.higherIsBetter ?? kind.value !== 'coding_cost')
const unit = computed(() => kindMeta.value?.unit ?? 'index')

const subtitle = computed(
  () =>
    `${t('models.methodology')} · ${higherIsBetter.value ? t('models.higherBetter') : t('models.lowerBetter')}`,
)

function formatScore(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '—'
  if (unit.value === 'usd') return `$${value.toFixed(2)}`
  if (unit.value === 'ratio') return value <= 1.5 ? `${(value * 100).toFixed(1)}` : value.toFixed(1)
  if (unit.value === 'elo') return Math.round(value).toString()
  return value.toFixed(1)
}

function formatDelta(value?: number | null) {
  if (value == null || value === 0) return '—'
  return value > 0 ? `↑${value}` : `↓${Math.abs(value)}`
}

function deltaClass(value?: number | null) {
  if (value == null || value === 0) return 'delta-flat'
  return value > 0 ? 'delta-up' : 'delta-down'
}

async function watchModel(row: ModelItem) {
  busy.value = row.model_name
  try {
    await toggleWatch('model', row.model_name)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="models-page">
    <PageHeader dense :title="t('models.title')" :subtitle="subtitle" :source="source" />
    <div class="mt-5 mb-3 flex flex-wrap items-center gap-2">
      <div class="filter-chip-row kind-chip-row" role="tablist" :aria-label="t('models.kindLabel')">
        <button
          v-for="k in kinds"
          :key="k.id"
          type="button"
          role="tab"
          :aria-selected="kind === k.id"
          :class="kind === k.id ? 'filter-chip-active' : 'filter-chip-idle'"
          :disabled="k.hasData === false"
          :title="k.hasData === false ? t('common.empty') : undefined"
          @click="kind = k.id"
        >
          {{ t(k.labelKey) }}
        </button>
      </div>
      <span class="text-[11px] text-zinc-600 tabular-nums ml-auto">{{ t('models.topN', { n: items.length }) }}</span>
    </div>
    <p class="text-[11px] text-zinc-500 mb-3">{{ t('models.chartHint') }} <span v-if="kind === 'coding_cost'" class="text-amber-400/80"> · {{ t('models.axisCostNote') }}</span></p>
    <p v-if="pending" class="text-sm text-zinc-500">{{ t('common.loading') }}</p>
    <template v-else-if="items.length">
      <div class="table-shell models-chart-shell p-3 sm:p-4">
        <ModelsBarChart :items="items" :higher-is-better="higherIsBetter" :unit="unit" :max-bars="24" />
      </div>
      <div class="mt-4 table-shell models-table-shell">
        <table class="data-table models-table">
          <thead>
            <tr>
              <th class="col-rank">{{ t('common.rank') }}</th>
              <th class="col-delta">{{ t('models.colRankDelta') }}</th>
              <th class="col-model">{{ t('models.colModel') }}</th>
              <th class="col-org">{{ t('models.colOrg') }}</th>
              <th class="col-score text-right">{{ t('models.colScore') }}</th>
              <th class="col-watch text-right">{{ t('actions.watch') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="`${kind}-${row.rank}-${row.model_name}`">
              <td class="col-rank tabular-nums rank-num">{{ row.rank }}</td>
              <td class="col-delta tabular-nums" :class="deltaClass(row.rank_delta)">{{ formatDelta(row.rank_delta) }}</td>
              <td class="col-model">
                <a :href="row.source_url || '#'" target="_blank" rel="noopener noreferrer" class="model-name-link">{{ row.model_name }}</a>
              </td>
              <td class="col-org">
                <span v-if="row.org" class="org-chip" :title="row.org">
                  <span class="org-avatar" aria-hidden="true">{{ row.org.charAt(0).toUpperCase() }}</span>
                  <span class="org-label">{{ row.org }}</span>
                </span>
                <span v-else class="text-zinc-600">—</span>
              </td>
              <td class="col-score text-right">
                <span class="score-value tabular-nums">{{ formatScore(row.score) }}</span>
              </td>
              <td class="col-watch text-right">
                <button type="button" class="btn-ghost" :disabled="busy === row.model_name" @click="watchModel(row)">
                  {{ isWatched('model', row.model_name) ? t('actions.watching') : t('actions.watch') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <div v-else class="table-shell models-table-shell px-4 py-10 text-center text-sm text-zinc-500">{{ t('common.empty') }}</div>
  </div>
</template>
