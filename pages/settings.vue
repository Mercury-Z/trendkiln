<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const LS_LAYOUT = 'ai-radar:github-layout'

const { t, locale, locales, setLocale } = useI18n()
const { digestCount, setDigestCount } = usePrefs()

const layout = ref<'card' | 'list'>('card')

onMounted(() => {
  try {
    const stored = localStorage.getItem(LS_LAYOUT)
    if (stored === 'card' || stored === 'list') layout.value = stored
  } catch {
    /* ignore */
  }
})

watch(layout, (value) => {
  try {
    localStorage.setItem(LS_LAYOUT, value)
  } catch {
    /* ignore */
  }
})

function chooseLocale(code: string) {
  setLocale(code as 'zh' | 'en')
}
</script>

<template>
  <div>
    <PageHeader :title="t('settings.title')" :subtitle="t('settings.subtitle')" />
    <div class="space-y-4 max-w-lg">
      <section class="card p-4">
        <h2 class="text-sm font-medium text-zinc-200 mb-3">{{ t('settings.language') }}</h2>
        <div class="flex gap-1.5" role="group">
          <button
            v-for="l in locales"
            :key="l.code"
            type="button"
            :class="locale === l.code ? 'lang-btn-active' : 'lang-btn-idle'"
            @click="chooseLocale(l.code)"
          >
            {{ l.name }}
          </button>
        </div>
      </section>
      <section class="card p-4">
        <h2 class="text-sm font-medium text-zinc-200 mb-1">{{ t('settings.digestCount') }}</h2>
        <p class="text-xs text-zinc-500 mb-3">{{ t('settings.digestCountHint') }}</p>
        <div class="flex items-center gap-3">
          <input
            type="range"
            min="3"
            max="10"
            :value="digestCount"
            class="flex-1 accent-violet-400"
            @input="setDigestCount(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="tabular-nums text-sm text-zinc-200 w-8 text-right">{{ digestCount }}</span>
        </div>
      </section>
      <section class="card p-4">
        <h2 class="text-sm font-medium text-zinc-200 mb-3">{{ t('settings.githubLayout') }}</h2>
        <div class="layout-toggle" role="group">
          <button type="button" :class="layout === 'card' ? 'layout-toggle-active' : 'layout-toggle-idle'" @click="layout = 'card'">
            {{ t('github.viewCard') }}
          </button>
          <button type="button" :class="layout === 'list' ? 'layout-toggle-active' : 'layout-toggle-idle'" @click="layout = 'list'">
            {{ t('github.viewList') }}
          </button>
        </div>
        <p class="mt-2 text-xs text-zinc-600">{{ t('settings.githubLayoutHint') }}</p>
      </section>
    </div>
  </div>
</template>
