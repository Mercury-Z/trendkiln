<script setup lang="ts">
import { computed, ref } from 'vue'
import { getDigest } from '~/composables/useDemoStore'
import type { DigestItem } from '~/demo/db'

const { t } = useI18n()
const { pickLocaleText } = useLocaleText()
const { digestCount } = usePrefs()
const { markRead, markSaved } = useItemActions()

const data = computed(() => getDigest(digestCount.value))
const items = computed(() => data.value.items ?? [])
const source = computed(() => data.value.source)
const pending = ref(false)
const busy = ref<string | null>(null)

const title = (item: DigestItem) => pickLocaleText(item.title, item.title_zh, item.title_en)
const subtitle = (item: DigestItem) => pickLocaleText(item.subtitle, item.subtitle_zh, item.subtitle_en)
const signal = (item: DigestItem) => pickLocaleText(item.signal, item.signal_zh, item.signal_en)

function typeLabel(type: string) {
  const key = `digest.types.${type}`
  const label = t(key)
  return label === key ? type : label
}

async function openItem(item: DigestItem) {
  busy.value = item.id
  try {
    await markRead('digest', item.id, true)
  } finally {
    busy.value = null
  }
}

async function saveItem(item: DigestItem) {
  busy.value = item.id
  try {
    await markSaved('digest', item.id, true)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="t('digest.title')"
      :subtitle="t('digest.subtitle', { n: items.length || digestCount })"
      :source="source"
    />
    <p v-if="pending" class="text-sm text-zinc-500">{{ t('common.loading') }}</p>
    <ul v-else-if="items.length" class="space-y-3">
      <li v-for="item in items" :key="item.id" class="card p-4">
        <a :href="item.url" target="_blank" rel="noopener" class="block group" @click="openItem(item)">
          <div class="flex items-center gap-2 mb-2">
            <span class="badge-muted">{{ typeLabel(item.type) }}</span>
            <span class="badge-signal">{{ signal(item) }}</span>
          </div>
          <h2 class="text-base font-semibold text-zinc-50 group-hover:text-violet-300 transition-colors duration-150">{{ title(item) }}</h2>
          <p class="mt-1.5 text-sm text-zinc-400 leading-relaxed">{{ subtitle(item) }}</p>
          <p class="mt-2.5 meta">{{ item.source }} · {{ t('digest.why') }}</p>
        </a>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-ghost" :disabled="busy === item.id" @click="saveItem(item)">{{ t('feed.saveLater') }}</button>
        </div>
      </li>
    </ul>
    <div v-else class="card border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">{{ t('digest.empty') }}</div>
  </div>
</template>
