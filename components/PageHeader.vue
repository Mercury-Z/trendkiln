<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    source?: string | null
    dense?: boolean
  }>(),
  { dense: false, title: '', subtitle: '', source: null },
)
</script>

<template>
  <div
    :class="
      props.dense
        ? 'flex flex-wrap items-start justify-between gap-3 mb-1'
        : 'mb-7 flex flex-wrap items-start justify-between gap-3'
    "
  >
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight text-zinc-50">{{ props.title }}</h1>
      <p v-if="props.subtitle" class="mt-1.5 text-sm text-zinc-500 leading-relaxed max-w-2xl">
        {{ props.subtitle }}
      </p>
    </div>
    <MockBadge :source="props.source" />
  </div>
</template>
