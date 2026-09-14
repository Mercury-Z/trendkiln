/** Checks whether the frozen snapshot corresponds to real-world data. */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }))

const daily = JSON.parse(readFileSync('E:/复刻钟政ds41f/trendkiln/demo/github-daily.json', 'utf8'))
console.log('snapshot_at:', daily.items[0].snapshot_at)
console.log('\n%-34s %10s %10s %8s', 'repo', 'snapshot', 'real now', 'delta')
for (const item of daily.items.slice(0, 8)) {
  let real = 'missing'
  try {
    real = gh(`repos/${item.full_name}`).stargazers_count
  } catch {
    /* 404 */
  }
  const d = typeof real === 'number' ? real - item.stars : '-'
  console.log(
    `${item.full_name.padEnd(34)} ${String(item.stars).padStart(10)} ${String(real).padStart(10)} ${String(d).padStart(8)}`,
  )
}

/* Are the leaderboard model names real? */
const models = JSON.parse(readFileSync('E:/复刻钟政ds41f/trendkiln/demo/models-intelligence.json', 'utf8'))
console.log('\nleaderboard snapshot_at:', models.items[0].snapshot_at)
console.log('top model entries:')
for (const m of models.items.slice(0, 5)) console.log(`  #${m.rank} ${m.model_name}  (${m.org})  score=${m.score.toFixed(2)}`)

console.log('\nfetching artificialanalysis.ai for cross-check…')
try {
  const res = await fetch('https://artificialanalysis.ai/zh/models', {
    headers: { 'user-agent': 'Mozilla/5.0' },
  })
  const html = await res.text()
  console.log('  status', res.status, 'bytes', html.length)
  for (const name of ['Claude Opus 5', 'Fable 5', 'GPT-6', 'Astra', 'GLM-5', 'Kimi K3', 'Grok 4.6']) {
    console.log(`  contains "${name}": ${html.includes(name)}`)
  }
} catch (e) {
  console.log('  fetch failed:', e.message)
}
