/** Determines how the published image/video arena boards are narrowed down. */
import { fetchText } from '../collector/lib/http.mjs'

function rscText(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,([\s\S]*?)\)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1].trim().replace(/\]$/, ''))
      } catch {
        return ''
      }
    })
    .join('')
}

function extractBalanced(text, start) {
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function bestRows(html) {
  const text = rscText(html)
  let best = []
  const marker = '[{"formatted":{"rank":1,'
  let from = 0
  for (;;) {
    const at = text.indexOf(marker, from)
    if (at < 0) break
    from = at + 1
    const raw = extractBalanced(text, at)
    if (!raw) continue
    try {
      const rows = JSON.parse(raw)
      if (Array.isArray(rows) && rows.length > best.length) best = rows
    } catch {
      /* ignore */
    }
  }
  return best
}

for (const [kind, url] of [
  ['text_to_image', 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image'],
  ['image_to_video', 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video'],
]) {
  const html = await fetchText(url, { timeoutMs: 60000 })
  const rows = bestRows(html)
  const withRank = rows.filter((r) => Number.isFinite(r?.formatted?.rank))
  const ranks = withRank.map((r) => r.formatted.rank)
  console.log(`\n===== ${kind} =====`)
  console.log(`  total rows: ${rows.length}`)
  console.log(`  rows with formatted.rank: ${withRank.length}  min=${Math.min(...ranks)} max=${Math.max(...ranks)}`)
  console.log(`  contiguous 1..N? ${ranks.join(',') === Array.from({ length: ranks.length }, (_, i) => i + 1).join(',')}`)
  console.log(`  rows isCurrent=true: ${rows.filter((r) => r.values?.isCurrent).length}`)
  console.log(`  first 3 formatted:`, withRank.slice(0, 3).map((r) => `${r.formatted.rank}:${r.values.name}:${r.values.elo}`).join(' | '))
  console.log(`  rank 35..40:`, withRank.slice(34, 40).map((r) => `${r.formatted.rank}:${r.values.name}`).join(' | '))
}
