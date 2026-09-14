<script setup lang="ts">
const props = defineProps<{ source?: string | null }>()
const { t } = useI18n()
</script>

<template>
  <span
    v-if="!props.source || props.source === 'mock'"
    class="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-900/80 px-2.5 py-0.5 text-[11px] text-zinc-400"
  ><span class="h-1 w-1 rounded-full bg-amber-400/80" aria-hidden="true" />{{ ' ' + t('common.mockBadge') }}</span>
</template>
