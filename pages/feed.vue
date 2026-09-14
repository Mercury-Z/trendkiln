<script setup lang="ts">
import { computed, ref } from 'vue'
import { getFeed } from '~/composables/useDemoStore'
import type { FeedItem } from '~/demo/db'

const { t } = useI18n()
const { pickLocaleText } = useLocaleText()
const { markRead, markSaved } = useItemActions()
const { addWatch } = useWatchlist()

const filter = ref<'all' | 'unread' | 'saved'>('all')

const data = computed(() => getFeed(filter.value))
const items = computed(() => data.value.items ?? [])
const source = computed(() => data.value.source)
const pending = ref(false)
const busy = ref<string | null>(null)

function title(item: FeedItem) {
  return pickLocaleText(item.title, item.title_zh, item.title_en, item.title_text)
}
function summary(item: FeedItem) {
  return pickLocaleText(item.summary, item.summary_zh, item.summary_en, item.summary_text)
}

async function markItemRead(item: FeedItem) {
  busy.value = item.id
  try {
    await markRead('feed', item.id, !item.read_at)
  } finally {
    busy.value = null
  }
}

async function openItem(item: FeedItem) {
  if (!item.read_at) await markRead('feed', item.id, true)
}

async function toggleSaved(item: FeedItem) {
  busy.value = item.id
  try {
    await markSaved('feed', item.id, !item.saved)
  } finally {
    busy.value = null
  }
}

async function watchItem(item: FeedItem) {
  const word = title(item)
    .split(/[\s|/·—-]+/)
    .find((part) => part.length >= 3)
  if (word) await addWatch('keyword', word.slice(0, 40))
}
</script>

<template>
  <div>
    <PageHeader :title="t('feed.title')" :subtitle="t('feed.subtitle')" :source="source" />
    <div class="mb-4 filter-chip-row" role="group" :aria-label="t('feed.filterLabel')">
      <button type="button" :class="filter === 'all' ? 'filter-chip-active' : 'filter-chip-idle'" @click="filter = 'all'">
        {{ t('feed.filterAll') }}
      </button>
      <button type="button" :class="filter === 'unread' ? 'filter-chip-active' : 'filter-chip-idle'" @click="filter = 'unread'">
        {{ t('feed.filterUnread') }}
      </button>
      <button type="button" :class="filter === 'saved' ? 'filter-chip-active' : 'filter-chip-idle'" @click="filter = 'saved'">
        {{ t('feed.filterSaved') }}
      </button>
    </div>
    <p v-if="pending" class="text-sm text-zinc-500">{{ t('common.loading') }}</p>
    <ul v-else-if="items.length" class="space-y-3">
      <li v-for="item in items" :key="item.id" class="card p-4" :class="item.read_at ? 'opacity-70' : ''">
        <a :href="item.url" target="_blank" rel="noopener" class="block group" @click="openItem(item)">
          <h2 class="font-semibold text-zinc-50 group-hover:text-violet-300 transition-colors duration-150">{{ title(item) }}</h2>
          <p v-if="summary(item)" class="mt-1.5 text-sm text-zinc-400 leading-relaxed">{{ summary(item) }}</p>
        </a>
        <div class="mt-2.5 flex flex-wrap items-center gap-2 meta">
          <span>{{ item.source_name }}</span>
          <span class="text-zinc-700">·</span>
          <time>{{ new Date(item.published_at).toLocaleString('en-US', { timeZone: 'UTC' }) }}</time>
          <span v-if="item.read_at" class="badge-muted">{{ t('feed.read') }}</span>
          <span v-if="item.saved" class="badge-accent">{{ t('feed.saved') }}</span>
        </div>
        <div v-if="item.tags?.length" class="mt-2.5 flex flex-wrap gap-1">
          <span v-for="tag in item.tags" :key="tag" class="tag-accent">{{ tag }}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-ghost" :disabled="busy === item.id" @click="markItemRead(item)">
            {{ item.read_at ? t('feed.markUnread') : t('feed.markRead') }}
          </button>
          <button type="button" class="btn-ghost" :disabled="busy === item.id" @click="toggleSaved(item)">
            {{ item.saved ? t('feed.unsave') : t('feed.saveLater') }}
          </button>
          <button type="button" class="btn-ghost" @click="watchItem(item)">{{ t('actions.watch') }}</button>
        </div>
      </li>
    </ul>
    <div v-else class="card border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">{{ t('feed.empty') }}</div>
  </div>
</template>
