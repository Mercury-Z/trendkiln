import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORIGIN = 'https://trendkiln.pages.dev'
const OUT = 'E:/复刻钟政ds41f/_recon/api'
mkdirSync(OUT, { recursive: true })

const targets = [
  ['digest', '/api/digest?limit=10'],
  ['digest-5', '/api/digest?limit=5'],
  ['github-daily', '/api/github?window=daily'],
  ['github-weekly', '/api/github?window=weekly'],
  ['github-monthly', '/api/github?window=monthly'],
  ['models-intelligence', '/api/models?kind=intelligence&limit=40'],
  ['models-coding_index', '/api/models?kind=coding_index&limit=40'],
  ['models-coding_cost', '/api/models?kind=coding_cost&limit=40'],
  ['models-text_to_image', '/api/models?kind=text_to_image&limit=40'],
  ['models-image_to_video', '/api/models?kind=image_to_video&limit=40'],
  ['feed-all', '/api/feed?filter=all'],
  ['feed-unread', '/api/feed?filter=unread'],
  ['feed-saved', '/api/feed?filter=saved'],
  ['watchlist', '/api/watchlist'],
]

for (const [name, path] of targets) {
  try {
    const res = await fetch(ORIGIN + path)
    const text = await res.text()
    writeFileSync(join(OUT, `${name}.json`), text, 'utf8')
    let brief = ''
    try {
      const j = JSON.parse(text)
      if (j.items) brief = `items=${j.items.length}`
      else brief = `keys=${Object.keys(j).join(',')}`
      if (j.kindMeta) brief += ` kind=${j.kindMeta.id}`
      if (j.window) brief += ` window=${j.window}`
    } catch {
      brief = 'non-json'
    }
    console.log(`${name.padEnd(24)} ${res.status} ${String(text.length).padStart(7)}B  ${brief}`)
  } catch (e) {
    console.log(`${name.padEnd(24)} FAIL ${e.message}`)
  }
}
