<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { hydrateDemoOverlay } from '~/composables/useDemoStore'

const { t, locale, locales, setLocale } = useI18n()
const route = useRoute()

const navItems = computed(() => [
  { to: '/', label: t('nav.digest') },
  { to: '/github', label: t('nav.github') },
  { to: '/models', label: t('nav.models') },
  { to: '/feed', label: t('nav.feed') },
  { to: '/watchlist', label: t('nav.watchlist') },
  { to: '/settings', label: t('nav.settings') },
])

function chooseLocale(code: string) {
  setLocale(code as 'zh' | 'en')
}

onMounted(() => {
  hydrateDemoOverlay()
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div class="mx-auto max-w-5xl px-4 py-3.5 flex flex-wrap items-center gap-3 justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <NuxtLink
            to="/"
            class="font-semibold text-lg tracking-tight text-zinc-50 hover:text-violet-300 transition-colors duration-150"
          >
            <span class="inline-flex items-center gap-2"><span class="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.7)]" aria-hidden="true" />{{ ' ' + t('app.name') }}</span>
          </NuxtLink>
          <span class="hidden sm:inline text-xs text-zinc-500 truncate">{{ t('app.tagline') }}</span>
        </div>
        <div class="flex items-center gap-1.5 text-sm" role="group" :aria-label="t('common.language')">
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
      </div>
      <nav class="mx-auto max-w-5xl px-4 pb-3 flex flex-wrap gap-1" aria-label="Primary">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="route.path === item.to ? 'nav-pill-active' : 'nav-pill-idle'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </header>
    <main class="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
      <slot />
    </main>
    <footer class="border-t border-zinc-800/60 py-5 text-center text-xs text-zinc-600">{{ t('app.name') }}</footer>
  </div>
</template>
