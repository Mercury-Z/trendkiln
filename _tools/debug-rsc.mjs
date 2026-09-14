/** Debugs the RSC leaderboard extraction for the image/video arenas. */
import { fetchText } from '../collector/lib/http.mjs'

const url = 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image'
const html = await fetchText(url, { timeoutMs: 45000 })

const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,([\s\S]*?)\)<\/script>/g)].map((m) => m[1].trim())
console.log('chunks:', chunks.length)

// Each push argument is a JS string literal, which is also a valid JSON string.
// Let JSON.parse do the unescaping instead of chaining regex replacements
// (order matters there and silently breaks sequences such as \\n).
const text = chunks
  .map((literal) => {
    try {
      return JSON.parse(literal.replace(/\]$/, ''))
    } catch (e) {
      return ''
    }
  })
  .join('')
console.log('text len:', text.length)

for (const marker of [
  '[[null,[{"formatted":{"rank":1,',
  '[{"formatted":{"rank":1,',
  '"formatted":{"rank":1,',
  '{"formatted":',
]) {
  console.log(`marker ${JSON.stringify(marker)} -> index ${text.indexOf(marker)}  count ${text.split(marker).length - 1}`)
}

const at = text.indexOf('[{"formatted":{"rank":1,')
if (at > 0) {
  console.log('\ncontext before:', JSON.stringify(text.slice(Math.max(0, at - 60), at)))
  // balanced scan
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let i = at; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  console.log('balanced end offset:', end, 'length:', end - at + 1)
  const raw = text.slice(at, end + 1)
  try {
    const parsed = JSON.parse(raw)
    console.log('parsed rows:', parsed.length)
    console.log('row0 values keys:', Object.keys(parsed[0].values).join(','))
    console.log('row0:', JSON.stringify(parsed[0].values).slice(0, 200))
  } catch (e) {
    console.log('JSON.parse failed:', e.message)
    console.log('head:', raw.slice(0, 300))
    console.log('tail:', raw.slice(-300))
  }
}
