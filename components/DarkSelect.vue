<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

interface Option {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Option[]
    disabled?: boolean
    id?: string
  }>(),
  { disabled: false, id: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLButtonElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
const panelStyle = ref<Record<string, string>>({})

const selected = computed(
  () => props.options.find((o) => o.value === props.modelValue) ?? props.options[0] ?? null,
)

function position() {
  const el = triggerEl.value
  if (!el || typeof window === 'undefined') return
  const rect = el.getBoundingClientRect()
  const gap = 4
  const maxPanel = 240
  const below = window.innerHeight - rect.bottom - gap
  const above = rect.top - gap
  const flip = below < Math.min(maxPanel, 120) && above > below
  const height = Math.min(maxPanel, flip ? above : below)
  const top = flip ? Math.max(8, rect.top - gap - height) : rect.bottom + gap
  const width = Math.max(rect.width, 112)
  let left = rect.left
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
  if (left < 8) left = 8
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(height)}px`,
    zIndex: '9999',
  }
}

function close() {
  open.value = false
  activeIndex.value = -1
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    activeIndex.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
    nextTick(() => {
      position()
      scrollActiveIntoView()
    })
  }
}

function choose(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
  close()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (rootEl.value?.contains(target) || listEl.value?.contains(target)) return
  close()
}

function reposition() {
  if (open.value) position()
}

function scrollActiveIntoView() {
  const list = listEl.value
  if (!list || activeIndex.value < 0) return
  ;(list.children[activeIndex.value] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      open.value = true
      activeIndex.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
      nextTick(() => {
        position()
        scrollActiveIntoView()
      })
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1)
    scrollActiveIntoView()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    scrollActiveIntoView()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) choose(option.value)
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})
</script>

<template>
  <div
    ref="rootEl"
    class="dark-select relative min-w-[7rem]"
    :class="{ 'opacity-50 pointer-events-none': props.disabled, 'z-30': open }"
  >
    <button
      :id="props.id"
      ref="triggerEl"
      type="button"
      class="dark-select-trigger input-dark flex w-full items-center justify-between gap-2 text-left"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="props.disabled"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="truncate text-zinc-100">{{ selected?.label ?? props.modelValue }}</span>
      <svg
        class="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        ref="listEl"
        role="listbox"
        class="dark-select-panel overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl shadow-black/50"
        :style="panelStyle"
        :aria-activedescendant="activeIndex >= 0 ? `dark-select-opt-${activeIndex}` : undefined"
      >
        <li
          v-for="(option, index) in props.options"
          :id="`dark-select-opt-${index}`"
          :key="option.value"
          role="option"
          :aria-selected="option.value === props.modelValue"
          class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm transition-colors duration-100"
          :class="[
            option.value === props.modelValue ? 'bg-violet-500/15 text-violet-100' : 'text-zinc-200',
            index === activeIndex && option.value !== props.modelValue ? 'bg-zinc-800/80' : '',
            index === activeIndex && option.value === props.modelValue ? 'bg-violet-500/25' : '',
          ]"
          @mouseenter="activeIndex = index"
          @click="choose(option.value)"
        >
          <span class="flex h-4 w-4 shrink-0 items-center justify-center text-violet-300" aria-hidden="true">
            <svg
              v-if="option.value === props.modelValue"
              class="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clip-rule="evenodd"
              />
            </svg>
          </span>
          <span class="truncate">{{ option.label }}</span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
