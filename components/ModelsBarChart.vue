<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { orgColor, orgInitial, orgLogo } from '~/composables/useOrgMeta'
import type { ModelItem } from '~/demo/db'

const props = withDefaults(
  defineProps<{
    items: ModelItem[]
    higherIsBetter?: boolean
    unit?: string
    maxBars?: number
  }>(),
  { higherIsBetter: true, unit: 'index', maxBars: 24 },
)

// Org logos live in /public, so they must be resolved against the deployment
// base path (a project page such as /trendkiln/ is not served from the root).
const appBase = useRuntimeConfig().app.baseURL
const LOGO_BASE = appBase.endsWith('/') ? appBase.slice(0, -1) : appBase
function logoUrl(org?: string | null): string | undefined {
  const path = orgLogo(org)
  return path ? LOGO_BASE + path : undefined
}

/* Chart geometry, identical to the original component. */
const PAD_TOP = 36
const PAD_BOTTOM = 148
const PAD_LEFT = 56
const PAD_RIGHT = 56
const BAR_GAP = 12
const CHART_HEIGHT = 380
const MAX_LOGO = 20
const LOGO_OFFSET = 6
const TOOLTIP_OFFSET = 14
const TOOLTIP_WIDTH = 260

const wrapRef = ref<HTMLElement | null>(null)
const wrapWidth = ref(960)

const bars = computed(() => props.items.slice(0, props.maxBars).filter((i) => i.score != null))
const maxScore = computed(() => {
  let max = 0
  for (const item of bars.value) if (item.score != null && item.score > max) max = item.score
  return max || 1
})
const viewWidth = computed(() => Math.max(wrapWidth.value, 320))
const barWidth = computed(() => {
  const n = Math.max(bars.value.length, 1)
  const available = viewWidth.value - PAD_LEFT - PAD_RIGHT - (n - 1) * BAR_GAP
  return Math.max(18, Math.min(56, available / n))
})
const logoSize = computed(() => Math.min(barWidth.value, MAX_LOGO))

function barHeight(score: number) {
  const usable = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM
  return Math.max(4, (score / maxScore.value) * usable)
}
function barX(index: number) {
  const n = Math.max(bars.value.length, 1)
  const total = n * barWidth.value + (n - 1) * BAR_GAP
  return PAD_LEFT + Math.max(0, (viewWidth.value - PAD_LEFT - PAD_RIGHT - total) / 2) + index * (barWidth.value + BAR_GAP)
}
function barY(score: number) {
  return CHART_HEIGHT - PAD_BOTTOM - barHeight(score)
}
function logoX(index: number) {
  return barX(index) + barWidth.value / 2 - logoSize.value / 2
}
function logoY() {
  return CHART_HEIGHT - PAD_BOTTOM + LOGO_OFFSET
}
function labelY() {
  return CHART_HEIGHT - PAD_BOTTOM + LOGO_OFFSET + logoSize.value + 10
}

function formatScore(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '—'
  if (props.unit === 'usd') return `$${value.toFixed(2)}`
  if (props.unit === 'ratio') return value <= 1.5 ? `${(value * 100).toFixed(1)}` : value.toFixed(1)
  if (props.unit === 'elo') return Math.round(value).toString()
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

function splitLabel(name: string) {
  const m = name.match(/^(.+?)\s*(\([^)]*\).*)?$/)
  if (m && m[2]) return { primary: m[1].trim(), detail: m[2].trim() }
  const parts = name.split(/\s+-\s+/)
  if (parts.length >= 2) return { primary: parts[0], detail: parts.slice(1).join(' - ') }
  if (name.length > 28) return { primary: name.slice(0, 26) + '…', detail: '' }
  return { primary: name, detail: '' }
}

/** This replica is a static deployment: open source links directly. */
function openSource(url?: string) {
  if (url && import.meta.client) window.open(url, '_blank', 'noopener,noreferrer')
}

const legend = computed(() => {
  const seen = new Map<string, { name: string; color: string; logo: string | undefined }>()
  for (const item of bars.value) {
    const org = item.org || 'Unknown'
    if (!seen.has(org)) seen.set(org, { color: orgColor(item.org), logo: logoUrl(item.org) })
  }
  return [...seen.entries()].map(([name, meta]) => ({ name, ...meta }))
})

const tooltip = ref<{ visible: boolean; x: number; y: number; row: ModelItem | null }>({
  visible: false,
  x: 0,
  y: 0,
  row: null,
})

function placeTooltip(clientX: number, clientY: number) {
  const el = wrapRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  let x = clientX - rect.left + TOOLTIP_OFFSET
  let y = clientY - rect.top + TOOLTIP_OFFSET
  const maxX = Math.max(8, rect.width - TOOLTIP_WIDTH - 8)
  const maxY = Math.max(8, rect.height - 96)
  if (x > maxX) x = clientX - rect.left - TOOLTIP_WIDTH - TOOLTIP_OFFSET
  if (y > maxY) y = clientY - rect.top - 80 - TOOLTIP_OFFSET
  tooltip.value.x = Math.max(8, Math.min(x, maxX))
  tooltip.value.y = Math.max(8, Math.min(y, maxY))
}

function showTooltip(row: ModelItem, event: PointerEvent) {
  tooltip.value.visible = true
  tooltip.value.row = row
  placeTooltip(event.clientX, event.clientY)
}
function moveTooltip(event: PointerEvent) {
  if (tooltip.value.visible) placeTooltip(event.clientX, event.clientY)
}
function hideTooltip() {
  tooltip.value.visible = false
  tooltip.value.row = null
}

let observer: ResizeObserver | null = null
onMounted(() => {
  const el = wrapRef.value
  if (!el) return
  if (typeof ResizeObserver === 'undefined') {
    wrapWidth.value = el.clientWidth || 960
    return
  }
  observer = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect?.width
    if (w && w > 0) wrapWidth.value = w
  })
  observer.observe(el)
  wrapWidth.value = el.clientWidth || 960
})
onUnmounted(() => observer?.disconnect())

const tooltipStyle = computed(() => ({
  left: `${tooltip.value.x}px`,
  top: `${tooltip.value.y}px`,
  borderLeftColor: tooltip.value.row ? orgColor(tooltip.value.row.org) : undefined,
}))
</script>

<template>
  <div ref="wrapRef" class="aa-chart-wrap">
    <div class="aa-chart-scroll">
      <svg
        class="aa-chart-svg"
        :viewBox="`0 0 ${viewWidth} ${CHART_HEIGHT}`"
        width="100%"
        :height="CHART_HEIGHT"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="leaderboard chart"
      >
        <line
          :x1="PAD_LEFT"
          :x2="viewWidth - PAD_RIGHT"
          :y1="CHART_HEIGHT - PAD_BOTTOM"
          :y2="CHART_HEIGHT - PAD_BOTTOM"
          class="aa-baseline"
        />
        <g v-for="(row, index) in bars" :key="`${row.rank}-${row.model_name}`">
          <a
            class="aa-bar-link"
            :href="row.source_url || undefined"
            target="_blank"
            rel="noopener noreferrer"
            @click.prevent="openSource(row.source_url)"
            @pointerenter="showTooltip(row, $event)"
            @pointermove="moveTooltip"
            @pointerleave="hideTooltip"
          >
            <rect
              class="aa-hit"
              :x="barX(index) - 2"
              :y="PAD_TOP - 8"
              :width="barWidth + 4"
              :height="CHART_HEIGHT - PAD_TOP - PAD_BOTTOM + LOGO_OFFSET + logoSize + 8"
              fill="transparent"
            />
            <rect
              class="aa-bar"
              :x="barX(index)"
              :y="barY(row.score)"
              :width="barWidth"
              :height="barHeight(row.score)"
              rx="4"
              :fill="orgColor(row.org)"
            />
            <text
              class="aa-score"
              :x="barX(index) + barWidth / 2"
              :y="barY(row.score) - 8"
              text-anchor="middle"
            >{{ formatScore(row.score) }}</text>
            <image
              v-if="logoUrl(row.org)"
              class="aa-org-logo"
              :href="logoUrl(row.org)"
              :x="logoX(index)"
              :y="logoY()"
              :width="logoSize"
              :height="logoSize"
              preserveAspectRatio="xMidYMid meet"
            />
            <g v-else :transform="`translate(${barX(index) + barWidth / 2}, ${logoY() + logoSize / 2})`">
              <circle class="aa-org-fallback" :r="logoSize / 2" :fill="orgColor(row.org)" />
              <text
                class="aa-org-fallback-text"
                text-anchor="middle"
                dominant-baseline="central"
              >{{ orgInitial(row.org) }}</text>
            </g>
            <g
              class="aa-label-group"
              :transform="`translate(${barX(index) + barWidth / 2}, ${labelY()}) rotate(-38)`"
            >
              <text class="aa-label-primary" x="0" y="0" text-anchor="end">{{ splitLabel(row.model_name).primary }}</text>
              <text class="aa-label-detail" x="0" y="12" text-anchor="end">{{ splitLabel(row.model_name).detail || row.org || '' }}</text>
            </g>
          </a>
        </g>
      </svg>
    </div>
    <div
      class="aa-tooltip"
      :class="{ 'aa-tooltip-visible': tooltip.visible && tooltip.row }"
      :style="tooltipStyle"
      role="tooltip"
      aria-hidden="true"
    >
      <template v-if="tooltip.row">
        <div class="aa-tooltip-head">
          <img
            v-if="logoUrl(tooltip.row.org)"
            class="aa-tooltip-logo"
            :src="logoUrl(tooltip.row.org)"
            :alt="tooltip.row.org || ''"
            width="20"
            height="20"
          />
          <span
            v-else
            class="aa-tooltip-initial"
            :style="{ background: orgColor(tooltip.row.org) }"
          >{{ orgInitial(tooltip.row.org) }}</span>
          <div class="aa-tooltip-titles">
            <div class="aa-tooltip-model">{{ tooltip.row.model_name }}</div>
            <div class="aa-tooltip-org">{{ tooltip.row.org || 'Unknown' }}</div>
          </div>
        </div>
        <div class="aa-tooltip-meta">
          <span class="aa-tooltip-rank">#{{ tooltip.row.rank }}</span>
          <span class="aa-tooltip-score" :style="{ color: orgColor(tooltip.row.org) }">{{ formatScore(tooltip.row.score) }}</span>
        </div>
      </template>
    </div>
    <ul v-if="legend.length" class="aa-legend" aria-label="org legend">
      <li v-for="entry in legend" :key="entry.name" class="aa-legend-item">
        <span class="aa-legend-swatch" :style="{ background: entry.color }" />
        <img
          v-if="entry.logo"
          class="aa-legend-logo"
          :src="entry.logo"
          :alt="entry.name"
          width="12"
          height="12"
        />
        <span>{{ entry.name }}</span>
      </li>
    </ul>
  </div>
</template>
