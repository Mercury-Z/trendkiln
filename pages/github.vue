<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getGithub } from '~/composables/useDemoStore'
import type { GithubItem } from '~/demo/db'

const LS_LAYOUT = 'ai-radar:github-layout'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { isWatched, toggleWatch } = useWatchlist()

const DEFAULT_WINDOWS = ['daily', 'weekly', 'monthly']
const WINDOW_KEYS: Record<string, string> = {
  daily: 'github.windowDaily',
  weekly: 'github.windowWeekly',
  monthly: 'github.windowMonthly',
}

function normalizeWindow(raw: unknown): string {
  const value = String(raw || 'daily').toLowerCase()
  if (value === 'week' || value === 'weekly') return 'weekly'
  if (value === 'month' || value === 'monthly') return 'monthly'
  return 'daily'
}

const windowFromQuery = () => normalizeWindow(route.query.window || route.query.since)

const currentWindow = ref(windowFromQuery())
// On a prerendered page the router only adopts the real URL query after
// hydration, so keep the selection in sync with the route as well as pushing to it.
watch(() => [route.query.window, route.query.since], () => {
  currentWindow.value = windowFromQuery()
})
watch(currentWindow, (value) => {
  if (windowFromQuery() === value) return
  router.replace({ query: { ...route.query, window: value } })
})

const data = computed(() => getGithub(currentWindow.value))
const items = computed(() => data.value.items ?? [])
const source = computed(() => data.value.source)
const windows = computed(() =>
  data.value.windows?.length
    ? data.value.windows
    : DEFAULT_WINDOWS.map((id) => ({ id, hasData: true })),
)
const pending = ref(false)
const busy = ref<string | null>(null)

/** `?layout=` wins over the persisted preference, mirroring the original. */
const layoutFromQuery = computed(() => {
  const value = route.query.layout
  return value === 'card' || value === 'list' ? value : null
})
const layout = ref<'card' | 'list'>(layoutFromQuery.value ?? 'card')

onMounted(() => {
  if (layoutFromQuery.value) {
    layout.value = layoutFromQuery.value
    return
  }
  try {
    const stored = localStorage.getItem(LS_LAYOUT)
    if (stored === 'card' || stored === 'list') layout.value = stored
  } catch {
    /* ignore */
  }
})
watch(layoutFromQuery, (value) => {
  if (value) layout.value = value
})
watch(layout, (value) => {
  if (layoutFromQuery.value) return
  try {
    localStorage.setItem(LS_LAYOUT, value)
  } catch {
    /* ignore */
  }
})

/** Localized insight column with flat-column and description fallbacks. */
function insight(item: GithubItem, field: 'purpose' | 'strengths' | 'innovations'): string | null {
  const cur = (locale.value || 'zh').toString().startsWith('zh') ? 'zh' : 'en'
  const other = cur === 'zh' ? 'en' : 'zh'

  const value = (item as unknown as Record<string, unknown>)[field]
  if (value && typeof value === 'object') {
    const obj = value as Record<string, string | undefined>
    if (typeof obj[cur] === 'string' && obj[cur]!.trim()) return obj[cur]!.trim()
    if (typeof obj[other] === 'string' && obj[other]!.trim()) return obj[other]!.trim()
  } else if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  const flat = (item as unknown as Record<string, unknown>)[`${field}_${cur}`]
  if (typeof flat === 'string' && flat.trim()) return flat.trim()
  const flatOther = (item as unknown as Record<string, unknown>)[`${field}_${other}`]
  if (typeof flatOther === 'string' && flatOther.trim()) return flatOther.trim()
  if (field === 'purpose' && item.description) return String(item.description)
  return null
}

async function toggleRepo(fullName: string) {
  busy.value = fullName
  try {
    await toggleWatch('repo', fullName)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div>
    <div class="mb-7 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <PageHeader dense :title="t('github.title')" :subtitle="t('github.subtitle')" :source="source" />
      </div>
      <div class="layout-toggle shrink-0 self-start mt-1" role="group" :aria-label="t('github.layout')">
        <button type="button" :class="layout === 'card' ? 'layout-toggle-active' : 'layout-toggle-idle'" @click="layout = 'card'">
          {{ t('github.viewCard') }}
        </button>
        <button type="button" :class="layout === 'list' ? 'layout-toggle-active' : 'layout-toggle-idle'" @click="layout = 'list'">
          {{ t('github.viewList') }}
        </button>
      </div>
    </div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="filter-chip-row" role="tablist" :aria-label="t('github.windowLabel')">
        <button
          v-for="w in windows"
          :key="w.id"
          type="button"
          role="tab"
          :aria-selected="currentWindow === w.id"
          :class="currentWindow === w.id ? 'filter-chip-active' : 'filter-chip-idle'"
          :disabled="w.hasData === false"
          :title="w.hasData === false ? t('common.empty') : undefined"
          @click="currentWindow = w.id"
        >
          {{ t(WINDOW_KEYS[w.id]) }}
        </button>
      </div>
    </div>
    <p v-if="pending" class="text-sm text-zinc-500">{{ t('common.loading') }}</p>
    <div v-else-if="layout === 'card'" class="grid gap-3 sm:grid-cols-2">
      <div v-for="item in items" :key="item.full_name" class="card gh-card p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[11px] tabular-nums text-zinc-600">#{{ item.rank }}</span>
              <a :href="item.html_url" target="_blank" rel="noopener" class="link-title truncate text-sm">{{ item.full_name }}</a>
            </div>
          </div>
          <div class="shrink-0 text-right text-xs tabular-nums">
            <div class="text-zinc-300">★ {{ item.stars.toLocaleString() }}</div>
            <div class="delta-up">+{{ item.stars_delta.toLocaleString() }}</div>
          </div>
        </div>
        <div class="mt-3 space-y-2">
          <div class="gh-insight">
            <span class="gh-insight-label">{{ t('github.purpose') }}</span>
            <p class="gh-insight-body">{{ insight(item, 'purpose') || t('github.noInsight') }}</p>
          </div>
          <div class="gh-insight">
            <span class="gh-insight-label">{{ t('github.strengths') }}</span>
            <p class="gh-insight-body">{{ insight(item, 'strengths') || t('github.noInsight') }}</p>
          </div>
          <div class="gh-insight">
            <span class="gh-insight-label">{{ t('github.innovations') }}</span>
            <p class="gh-insight-body">{{ insight(item, 'innovations') || t('github.noInsight') }}</p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-1.5">
          <span v-if="item.language" class="badge-muted">{{ item.language }}</span>
          <span v-for="topic in (item.topics || []).slice(0, 4)" :key="topic" class="tag">{{ topic }}</span>
          <button type="button" class="btn-ghost ml-auto" :disabled="busy === item.full_name" @click="toggleRepo(item.full_name)">
            {{ isWatched('repo', item.full_name) ? t('actions.watching') : t('actions.watch') }}
          </button>
        </div>
      </div>
    </div>
    <div v-else class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th class="w-10">#</th>
            <th>Repo</th>
            <th>Lang</th>
            <th class="text-right">{{ t('common.stars') }}</th>
            <th class="text-right">{{ t('common.delta') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.full_name">
            <td class="text-zinc-600 tabular-nums text-xs">{{ item.rank }}</td>
            <td>
              <a :href="item.html_url" target="_blank" rel="noopener" class="link-title">{{ item.full_name }}</a>
              <p class="meta mt-0.5 line-clamp-2">{{ insight(item, 'purpose') || item.description || t('github.noInsight') }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1">
                <span v-for="topic in (item.topics || []).slice(0, 5)" :key="topic" class="tag">{{ topic }}</span>
                <button type="button" class="btn-ghost" :disabled="busy === item.full_name" @click="toggleRepo(item.full_name)">
                  {{ isWatched('repo', item.full_name) ? t('actions.watching') : t('actions.watch') }}
                </button>
              </div>
            </td>
            <td class="text-zinc-400 whitespace-nowrap">{{ item.language || '—' }}</td>
            <td class="text-right tabular-nums text-zinc-300">{{ item.stars.toLocaleString() }}</td>
            <td class="text-right tabular-nums delta-up">+{{ item.stars_delta.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
