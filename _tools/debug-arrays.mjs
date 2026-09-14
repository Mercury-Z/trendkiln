/** Enumerates every leaderboard array in the arena pages so we can pick the right one. */
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

for (const [kind, url] of [
  ['text_to_image', 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image'],
  ['image_to_video', 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video'],
]) {
  const html = await fetchText(url, { timeoutMs: 60000 })
  const text = rscText(html)
  console.log(`\n===== ${kind} =====`)

  const found = []
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
      if (Array.isArray(rows) && rows.length) found.push({ at, rows })
    } catch {
      /* ignore */
    }
  }

  for (const { at, rows } of found) {
    const before = text.slice(Math.max(0, at - 160), at).replace(/\n/g, ' ')
    const head = rows
      .slice(0, 2)
      .map((r) => `${r.values.name}=${r.values.elo}`)
      .join(' | ')
    // look for an audio-related flag on the rows
    const keys = Object.keys(rows[0].values)
    const audioish = keys.filter((k) => /audio|variant|arena|category/i.test(k))
    console.log(`  len=${String(rows.length).padStart(4)}  before="${before.slice(-70)}"`)
    console.log(`        head: ${head}`)
    if (audioish.length) console.log(`        audioish keys: ${audioish.join(',')} -> ${JSON.stringify(rows[0].values[audioish[0]])}`)
  }
}
