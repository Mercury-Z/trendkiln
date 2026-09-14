/** Verifies the arena boards now resolve to the same leaderboard the original used. */
import { collectModelKind, KIND_META } from '../collector/sources/models.mjs'

for (const id of ['text_to_image', 'image_to_video']) {
  const meta = KIND_META.find((k) => k.id === id)
  const payload = await collectModelKind(meta, null, new Map())
  console.log(`\n===== ${id} — ${payload.items.length} rows =====`)
  for (const item of payload.items.slice(0, 5)) {
    console.log(`  #${item.rank} ${item.model_name}  [${item.org}]  ${item.score}`)
  }
  console.log('  source_url:', payload.items[0].source_url)
}

console.log('\n--- reference (original frozen snapshot) ---')
const { readFileSync } = await import('node:fs')
for (const id of ['text_to_image', 'image_to_video']) {
  const prev = JSON.parse(readFileSync(`E:/复刻钟政ds41f/_recon/demo-before/models-${id}.json`, 'utf8'))
  console.log(`\n${id} — was ${prev.items.length} rows`)
  for (const item of prev.items.slice(0, 3)) console.log(`  #${item.rank} ${item.model_name}  [${item.org}]  ${item.score}`)
}
