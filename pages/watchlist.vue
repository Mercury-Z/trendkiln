<script setup lang="ts">
import { computed, ref } from 'vue'

const { t } = useI18n()
const { items, source, pending, addWatch, removeWatch } = useWatchlist()

const targetType = ref('keyword')
const targetKey = ref('')
const busy = ref(false)
const errorMessage = ref('')

const typeOptions = computed(() => [
  { value: 'keyword', label: t('watchlist.typeKeyword') },
  { value: 'repo', label: t('watchlist.typeRepo') },
  { value: 'model', label: t('watchlist.typeModel') },
])

async function submit() {
  const key = targetKey.value.trim()
  if (!key) return
  busy.value = true
  errorMessage.value = ''
  try {
    await addWatch(targetType.value, key)
    targetKey.value = ''
  } catch (error) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    errorMessage.value = err?.data?.statusMessage || err?.message || String(error)
  } finally {
    busy.value = false
  }
}

async function remove(id: string) {
  busy.value = true
  try {
    await removeWatch({ id })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader :title="t('watchlist.title')" :subtitle="t('watchlist.subtitle')" :source="source" />
    <form class="card relative z-20 mb-5 flex flex-wrap items-end gap-2 overflow-visible p-3" @submit.prevent="submit">
      <label class="text-xs text-zinc-500">
        <span class="mb-1 block">{{ t('watchlist.type') }}</span>
        <DarkSelect v-model="targetType" :options="typeOptions" :disabled="busy" />
      </label>
      <label class="min-w-[12rem] flex-1 text-xs text-zinc-500">
        <span class="mb-1 block">{{ t('watchlist.key') }}</span>
        <input
          v-model="targetKey"
          type="text"
          class="input-dark w-full"
          :placeholder="t('watchlist.keyPlaceholder')"
          autocomplete="off"
        />
      </label>
      <button type="submit" class="btn-accent" :disabled="busy || !targetKey.trim()">{{ t('watchlist.add') }}</button>
    </form>
    <p v-if="errorMessage" class="mb-3 text-xs text-rose-400">{{ errorMessage }}</p>
    <p v-if="pending" class="text-sm text-zinc-500">{{ t('common.loading') }}</p>
    <div v-else-if="items.length === 0" class="card border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">
      <p>{{ t('watchlist.emptyHint') }}</p>
      <p class="mt-2 text-xs text-zinc-600">{{ t('watchlist.emptyHint2') }}</p>
    </div>
    <ul v-else class="space-y-3">
      <li v-for="item in items" :key="item.id" class="card p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge-muted">{{ item.target_type }}</span>
              <span class="font-semibold text-zinc-100">{{ item.target_key }}</span>
            </div>
            <p v-if="item.note" class="mt-1.5 text-sm text-zinc-400 leading-relaxed">{{ item.note }}</p>
            <div class="mt-2.5 meta">
              {{ t('watchlist.signals') }}:
              <span v-if="item.signals?.length" class="text-emerald-400/90">{{ item.signals.join(' · ') }}</span>
              <span v-else class="text-zinc-600">—</span>
            </div>
          </div>
          <button type="button" class="btn-ghost shrink-0" :disabled="busy" @click="remove(item.id)">{{ t('watchlist.remove') }}</button>
        </div>
      </li>
    </ul>
  </div>
</template>
