/**
 * Headless-browser smoke test driven over the Chrome DevTools Protocol.
 *
 * Expectations are derived from demo/*.json rather than hard-coded, so the same
 * suite validates any collector run — the data is refreshed on a schedule and
 * the assertions must not rot with it.
 *
 * Usage: node _tools/smoke.mjs [origin] [--base=/trendkiln/]
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const ORIGIN = args.find((a) => !a.startsWith('--')) || 'http://localhost:3100'
const BASE = (args.find((a) => a.startsWith('--base=')) || '--base=/').split('=')[1]
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const DEMO = join(resolve(import.meta.dirname, '..'), 'demo')

/* ------------------------------------------------------------------ *
 * Expectations, derived from the fixtures the site was built from
 * ------------------------------------------------------------------ */
const read = (name) => JSON.parse(readFileSync(join(DEMO, name), 'utf8'))
const FIX = {
  digest: read('digest.json'),
  feed: read('feed.json'),
  github: {
    daily: read('github-daily.json'),
    weekly: read('github-weekly.json'),
    monthly: read('github-monthly.json'),
  },
  models: Object.fromEntries(
    ['intelligence', 'coding_index', 'coding_cost', 'text_to_image', 'image_to_video'].map((k) => [
      k,
      read(`models-${k}.json`),
    ]),
  ),
  watchlist: read('watchlist.json'),
}

const MODEL_LIMIT = 40 // the models page requests limit=40
const MAX_BARS = 24
const DIGEST_DEFAULT = 5
const TYPE_LABEL = {
  github_surge: 'GitHub 异动',
  model_rank_change: '模型排名',
  feed_must_read: '必读资讯',
}
const KIND_TAB = {
  intelligence: '智能指数',
  coding_index: '编程智能体指数',
  coding_cost: '编程成本',
  text_to_image: '文生图',
  image_to_video: '图生视频',
}

const expected = {
  digestCount: Math.min(FIX.digest.items.length, DIGEST_DEFAULT),
  firstBadges: [TYPE_LABEL[FIX.digest.items[0].type] ?? FIX.digest.items[0].type, FIX.digest.items[0].signal.zh],
  firstMeta: `${FIX.digest.items[0].source} · 为何出现`,
  feedTotal: FIX.feed.items.length,
  feedRead: FIX.feed.items.filter((i) => i.read_at).length,
  feedUnread: FIX.feed.items.filter((i) => !i.read_at).length,
  githubDaily: FIX.github.daily.items.length,
  githubWeekly: FIX.github.weekly.items.length,
  modelsRows: (kind) => Math.min(FIX.models[kind].items.length, MODEL_LIMIT),
  modelsBars: (kind) => Math.min(Math.min(FIX.models[kind].items.length, MODEL_LIMIT), MAX_BARS),
  textToImageTopScore: (() => {
    const top = FIX.models.text_to_image.items[0]
    return FIX.models.text_to_image.kindMeta.unit === 'elo' ? String(Math.round(top.score)) : String(top.score)
  })(),
  watchlistSeed: FIX.watchlist.items.length,
}

/* ------------------------------------------------------------------ *
 * CDP plumbing
 * ------------------------------------------------------------------ */
const profile = mkdtempSync(join(tmpdir(), 'tk-smoke-'))
const edge = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cleanup() {
  try {
    spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* best effort */
  }
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error(`CDP endpoint on ${PORT} never became available`)
}

const ws = new WebSocket(await targetUrl())
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', rej, { once: true })
})

let nextId = 1
const pending = new Map()
const consoleErrors = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    return
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params?.exceptionDetails?.exception?.description ?? 'exception')
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result.value
}

async function waitFor(expression, done, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await evaluate(expression)
    if (done(last)) return last
    await sleep(200)
  }
  return last
}

async function goto(path) {
  await send('Page.navigate', { url: ORIGIN + BASE.replace(/\/$/, '') + path })
  await waitFor(`document.readyState`, (v) => v === 'complete')
  await sleep(500)
}

const results = []
function check(name, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want)
  results.push({ name, ok, actual, expected: want })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}` +
      (ok ? '' : `\n        expected ${JSON.stringify(want)}\n        actual   ${JSON.stringify(actual)}`),
  )
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const waitForValue = (expr, want) => waitFor(expr, (v) => same(v, want))

await send('Runtime.enable')
await send('Page.enable')

console.log(`origin ${ORIGIN}${BASE}  ·  digest=${FIX.digest.items.length} feed=${FIX.feed.items.length}\n`)

/* ---------------- start clean ---------------- */
await goto('/')
await evaluate(`localStorage.clear()`)
await goto('/')

/* ---------------- digest ---------------- */
check(
  'home: digest item count',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n > 0),
  expected.digestCount,
)
check(
  'home: first card badges',
  await evaluate(
    `[...document.querySelectorAll('main ul > li')[0].querySelectorAll('span')].slice(0,2).map(s=>s.textContent)`,
  ),
  expected.firstBadges,
)
check('home: source meta line', await evaluate(`document.querySelector('main ul > li p.meta').textContent.trim()`), expected.firstMeta)

/* ---------------- i18n ---------------- *
 * On the original deployment this toggle is broken (clicking English leaves the
 * UI in Chinese); the replica actually switches, so prove it here. */
await evaluate(`[...document.querySelectorAll('header button')].find(b=>b.textContent.trim()==='English').click()`)
check(
  'locale switch -> english nav',
  await waitForValue(`[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`, [
    'Digest',
    'GitHub heat',
    'Model board',
    'Feed',
    'Watchlist',
    'Settings',
  ]),
  ['Digest', 'GitHub heat', 'Model board', 'Feed', 'Watchlist', 'Settings'],
)
check('locale switch -> english body copy', await evaluate(`document.querySelector('main h1').textContent.trim()`), "Today's digest")

await evaluate(`[...document.querySelectorAll('header button')].find(b=>b.textContent.trim()==='中文').click()`)
check(
  'locale switch back -> zh nav',
  await waitForValue(`[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`, [
    '今日摘要',
    'GitHub 热度',
    '模型榜',
    '资讯',
    '我的关注',
    '设置',
  ]),
  ['今日摘要', 'GitHub 热度', '模型榜', '资讯', '我的关注', '设置'],
)

/* ---------------- feed ---------------- */
await goto('/feed')
check(
  'feed: all items',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n > 0),
  expected.feedTotal,
)
check('feed: read items dimmed', await evaluate(`document.querySelectorAll('main ul > li.opacity-70').length`), expected.feedRead)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='未读').click()`)
check(
  'feed: unread filter',
  await waitForValue(`document.querySelectorAll('main ul > li').length`, expected.feedUnread),
  expected.feedUnread,
)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='稍后读').click()`)
check(
  'feed: saved filter is empty',
  await waitForValue(`document.querySelectorAll('main ul > li').length`, 0),
  0,
)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='全部').click()`)
await waitForValue(`document.querySelectorAll('main ul > li').length`, expected.feedTotal)
// The first few items are already read in the fixture, so toggle a later one.
const toggleIndex = Math.min(expected.feedRead + 1, expected.feedTotal - 1)
await evaluate(`document.querySelectorAll('main ul > li')[${toggleIndex}].querySelector('button.btn-ghost').click()`)
check(
  'feed: mark-read persists in the list',
  await waitForValue(`document.querySelectorAll('main ul > li.opacity-70').length`, expected.feedRead + 1),
  expected.feedRead + 1,
)
check(
  'feed: mark-read persists in storage',
  await evaluate(`Object.keys(JSON.parse(localStorage.getItem('ai-radar:item-state')||'{}')).some(k=>k.startsWith('feed:'))`),
  true,
)

/* ---------------- github ---------------- */
await goto('/github')
check(
  'github: daily card count',
  await waitFor(`document.querySelectorAll('main .gh-card').length`, (n) => n > 0),
  expected.githubDaily,
)
check('github: card layout active by default', await evaluate(`document.querySelector('main .layout-toggle').textContent.trim()`), '卡片列表')
check(
  'github: card shows three insight blocks',
  await evaluate(`document.querySelector('main .gh-card').querySelectorAll('.gh-insight').length`),
  3,
)
await evaluate(`[...document.querySelectorAll('main .layout-toggle button')].find(b=>b.textContent.trim()==='列表').click()`)
check(
  'github: list layout rows',
  await waitFor(`document.querySelectorAll('main tbody tr').length`, (n) => n > 0),
  expected.githubDaily,
)
check('github: layout persisted', await evaluate(`localStorage.getItem('ai-radar:github-layout')`), 'list')
await goto('/github?window=weekly')
check(
  'github: weekly window honours query',
  await waitForValue(`document.querySelectorAll('main tbody tr').length`, expected.githubWeekly),
  expected.githubWeekly,
)
check('github: layout restored from storage', await evaluate(`!!document.querySelector('main table')`), true)

/* ---------------- models ---------------- */
await goto('/models')
check(
  'models: chart bars',
  await waitFor(`document.querySelectorAll('main svg .aa-bar').length`, (n) => n > 0),
  expected.modelsBars('intelligence'),
)
check('models: table rows', await evaluate(`document.querySelectorAll('main tbody tr').length`), expected.modelsRows('intelligence'))
await evaluate(`[...document.querySelectorAll('main [role=tab]')].find(b=>b.textContent.trim()==='${KIND_TAB.text_to_image}').click()`)
check(
  'models: text_to_image bars capped at maxBars',
  await waitForValue(`document.querySelectorAll('main svg .aa-bar').length`, expected.modelsBars('text_to_image')),
  expected.modelsBars('text_to_image'),
)
check(
  'models: text_to_image table rows',
  await evaluate(`document.querySelectorAll('main tbody tr').length`),
  expected.modelsRows('text_to_image'),
)
check('models: url reflects kind', await waitForValue(`location.search`, '?kind=text_to_image'), '?kind=text_to_image')
check(
  'models: score formatting',
  await evaluate(`document.querySelector('main .score-value').textContent.trim()`),
  expected.textToImageTopScore,
)
check(
  'models: chart tooltip hidden by default',
  await evaluate(`document.querySelector('main .aa-tooltip').className.includes('aa-tooltip-visible')`),
  false,
)
check('models: legend lists orgs', await evaluate(`document.querySelectorAll('main .aa-legend-item').length > 0`), true)

/* ---------------- settings + prefs ---------------- */
await goto('/settings')
check('settings: digest slider default', await evaluate(`document.querySelector('input[type=range]').value`), String(DIGEST_DEFAULT))
check('settings: demo-data badge shown', await evaluate(`document.querySelector('main').textContent.includes('演示数据')`), true)
await evaluate(`(()=>{const el=document.querySelector('input[type=range]');el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
check('settings: digest count persisted', await waitForValue(`localStorage.getItem('ai-radar:digest-count')`, '8'), '8')
await goto('/')
check(
  'home: digest size follows preference',
  await waitForValue(`document.querySelectorAll('main ul > li').length`, Math.min(FIX.digest.items.length, 8)),
  Math.min(FIX.digest.items.length, 8),
)

/* ---------------- watchlist ---------------- */
await goto('/watchlist')
check(
  'watchlist: seeded items',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n > 0),
  expected.watchlistSeed,
)
check(
  'watchlist: keyword chip + signals',
  await evaluate(`document.querySelectorAll('main ul > li')[0].querySelector('.badge-muted').textContent.trim()`),
  FIX.watchlist.items[0].target_type,
)
await evaluate(
  `(()=>{const i=document.querySelector('main input[type=text]');i.value='DeepSeek';i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='添加关注').click()`)
check(
  'watchlist: item added via form',
  await waitForValue(`document.querySelectorAll('main ul > li').length`, expected.watchlistSeed + 1),
  expected.watchlistSeed + 1,
)
check(
  'watchlist: new entry gets derived signals',
  await evaluate(
    `(document.querySelectorAll('main ul > li')[0].querySelector('span.text-emerald-400\\\\/90')?.textContent||'').length > 0`,
  ),
  true,
)
await evaluate(`document.querySelectorAll('main ul > li')[0].querySelector('button').click()`)
check(
  'watchlist: item removed',
  await waitForValue(`document.querySelectorAll('main ul > li').length`, expected.watchlistSeed),
  expected.watchlistSeed,
)
check(
  'watchlist: removal persisted',
  await evaluate(`JSON.parse(localStorage.getItem('ai-radar:watchlist')||'{}').removed?.length ?? 0`),
  1,
)

/* ---------------- report ---------------- */
console.log('')
const realErrors = consoleErrors.filter((e) => !/favicon|DevTools|Failed to load resource/i.test(String(e)))
if (realErrors.length) {
  console.log('Console errors observed:')
  for (const e of [...new Set(realErrors)].slice(0, 10)) console.log('  - ' + String(e).split('\n')[0])
} else {
  console.log('No console errors.')
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)

ws.close()
cleanup()
process.exit(failed.length ? 1 : 0)
