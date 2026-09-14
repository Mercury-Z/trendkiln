/**
 * Headless-browser smoke test driven over the Chrome DevTools Protocol.
 * Covers hydration and the interactive behaviours that server-rendered markup
 * comparison cannot reach.
 *
 * Usage: node _tools/smoke.mjs [origin]   (default http://localhost:3100)
 *
 * Notes
 *  - a random debugging port is used and the spawned browser tree is killed by
 *    PID afterwards, so runs never attach to a stale Edge instance (which would
 *    leak localStorage between runs);
 *  - storage is cleared up-front and `waitFor` polls instead of sleeping, which
 *    keeps the test stable against on-demand dev-server compilation.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] || 'http://localhost:3100'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)

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

/** Poll an expression until `done` accepts it (or time out, returning last value). */
async function waitFor(expression, done, timeoutMs = 8000) {
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
  await send('Page.navigate', { url: ORIGIN + path })
  await waitFor(`document.readyState`, (v) => v === 'complete')
  await sleep(500)
}

const results = []
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ name, ok, actual, expected })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}` +
      (ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`),
  )
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

await send('Runtime.enable')
await send('Page.enable')

/* ---------------- start from a clean slate ---------------- */
await goto('/')
await evaluate(`localStorage.clear()`)
await goto('/')

/* ---------------- digest ---------------- */
check(
  'home: digest item count',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n > 0),
  5,
)
check(
  'home: first card badges',
  await evaluate(
    `[...document.querySelectorAll('main ul > li')[0].querySelectorAll('span')].slice(0,2).map(s=>s.textContent)`,
  ),
  ['GitHub 异动', '+80 星标'],
)
check(
  'home: source meta line',
  await evaluate(`document.querySelector('main ul > li p.meta').textContent.trim()`),
  'GitHub Trending · 为何出现',
)

/* ---------------- i18n ---------------- *
 * The locale dictionary is a lazily loaded chunk, so poll for the result.
 * (On the original deployment this toggle is broken — clicking English leaves
 * the UI in Chinese. The replica actually switches.) */
await evaluate(`[...document.querySelectorAll('header button')].find(b=>b.textContent.trim()==='English').click()`)
check(
  'locale switch -> english nav',
  await waitFor(
    `[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`,
    (v) => same(v, ['Digest', 'GitHub heat', 'Model board', 'Feed', 'Watchlist', 'Settings']),
  ),
  ['Digest', 'GitHub heat', 'Model board', 'Feed', 'Watchlist', 'Settings'],
)
check('locale switch -> english body copy', await evaluate(`document.querySelector('main h1').textContent.trim()`), "Today's digest")

await evaluate(`[...document.querySelectorAll('header button')].find(b=>b.textContent.trim()==='中文').click()`)
check(
  'locale switch back -> zh nav',
  await waitFor(
    `[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`,
    (v) => same(v, ['今日摘要', 'GitHub 热度', '模型榜', '资讯', '我的关注', '设置']),
  ),
  ['今日摘要', 'GitHub 热度', '模型榜', '资讯', '我的关注', '设置'],
)

/* ---------------- feed filters ---------------- */
await goto('/feed')
check(
  'feed: all items',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n > 0),
  80,
)
check('feed: read items dimmed', await evaluate(`document.querySelectorAll('main ul > li.opacity-70').length`), 3)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='未读').click()`)
check(
  'feed: unread filter',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n === 77),
  77,
)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='稍后读').click()`)
check(
  'feed: saved filter renders empty state',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n === 0),
  0,
)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='全部').click()`)
await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n === 80)
await evaluate(`document.querySelectorAll('main ul > li')[1].querySelector('button.btn-ghost').click()`)
check(
  'feed: mark-read persists in the list',
  await waitFor(`document.querySelectorAll('main ul > li.opacity-70').length`, (n) => n === 4),
  4,
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
  19,
)
check('github: card layout active by default', await evaluate(`document.querySelector('main .layout-toggle').textContent.trim()`), '卡片列表')
await evaluate(`[...document.querySelectorAll('main .layout-toggle button')].find(b=>b.textContent.trim()==='列表').click()`)
check(
  'github: list layout rows',
  await waitFor(`document.querySelectorAll('main tbody tr').length`, (n) => n > 0),
  19,
)
check('github: layout persisted', await evaluate(`localStorage.getItem('ai-radar:github-layout')`), 'list')
await goto('/github?window=weekly')
check(
  'github: weekly window honours query',
  await waitFor(`document.querySelectorAll('main tbody tr').length`, (n) => n === 23),
  23,
)
check('github: layout restored from storage', await evaluate(`!!document.querySelector('main table')`), true)

/* ---------------- models ---------------- */
await goto('/models')
check('models: chart bars', await waitFor(`document.querySelectorAll('main svg .aa-bar').length`, (n) => n > 0), 11)
check('models: table rows', await evaluate(`document.querySelectorAll('main tbody tr').length`), 11)
await evaluate(`[...document.querySelectorAll('main [role=tab]')].find(b=>b.textContent.trim()==='文生图').click()`)
check(
  'models: text_to_image bars capped at maxBars',
  await waitFor(`document.querySelectorAll('main svg .aa-bar').length`, (n) => n === 24),
  24,
)
check('models: text_to_image table rows', await evaluate(`document.querySelectorAll('main tbody tr').length`), 40)
check('models: url reflects kind', await evaluate(`location.search`), '?kind=text_to_image')
check('models: elo score formatting', await evaluate(`document.querySelector('main .score-value').textContent.trim()`), '1187')
check(
  'models: chart tooltip hidden by default',
  await evaluate(`document.querySelector('main .aa-tooltip').className.includes('aa-tooltip-visible')`),
  false,
)
check(
  'models: legend lists orgs',
  await evaluate(`document.querySelectorAll('main .aa-legend-item').length > 0`),
  true,
)

/* ---------------- settings + prefs ---------------- */
await goto('/settings')
check('settings: digest slider default', await evaluate(`document.querySelector('input[type=range]').value`), '5')
check(
  'settings: demo-data badge shown',
  await evaluate(`document.querySelector('main').textContent.includes('演示数据')`),
  true,
)
await evaluate(`(()=>{const el=document.querySelector('input[type=range]');el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
check(
  'settings: digest count persisted',
  await waitFor(`localStorage.getItem('ai-radar:digest-count')`, (v) => v === '8'),
  '8',
)
await goto('/')
check(
  'home: digest size follows preference',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n === 8),
  8,
)
check('home: subtitle follows preference', await evaluate(`document.querySelector('main p').textContent.trim()`), '今日 8 件事')

/* ---------------- watchlist ---------------- */
await goto('/watchlist')
check(
  'watchlist: seeded items',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n > 0),
  2,
)
check(
  'watchlist: keyword chip + signals',
  await evaluate(`document.querySelectorAll('main ul > li')[0].querySelector('.badge-muted').textContent.trim()`),
  'keyword',
)
await evaluate(
  `(()=>{const i=document.querySelector('main input[type=text]');i.value='DeepSeek';i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
)
await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='添加关注').click()`)
check(
  'watchlist: item added via form',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n === 3),
  3,
)
check(
  'watchlist: new entry gets derived signals',
  await evaluate(
    `(document.querySelectorAll('main ul > li')[0].querySelector('span.text-emerald-400\\\\/90')?.textContent||'').includes('DeepSeek')`,
  ),
  true,
)
await evaluate(`document.querySelectorAll('main ul > li')[0].querySelector('button').click()`)
check(
  'watchlist: item removed',
  await waitFor(`document.querySelectorAll('main ul > li').length`, (n) => n === 2),
  2,
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
