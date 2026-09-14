/**
 * Verifies that the retired deployment redirects to the new one, in a real
 * browser (meta refresh + location.replace), including the 404 fallback.
 *
 * Usage: node _tools/verify-redirect.mjs [oldBase] [newBase]
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OLD = (process.argv[2] || 'https://mercury-z.github.io/trendkiln-clone').replace(/\/$/, '')
const NEW = (process.argv[3] || 'https://mercury-z.github.io/trendkiln').replace(/\/$/, '')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9800 + Math.floor(Math.random() * 150)

const CASES = [
  ['/', `${NEW}/`],
  ['/github/', `${NEW}/github`],
  ['/models/', `${NEW}/models`],
  ['/feed/', `${NEW}/feed`],
  ['/watchlist/', `${NEW}/watchlist`],
  ['/settings/', `${NEW}/settings`],
  ['/some/deep/old/link/', `${NEW}/`],
]

const profile = mkdtempSync(join(tmpdir(), 'tk-redir-'))
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

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const p = list.find((t) => t.type === 'page')
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl
    } catch {
      /* retry */
    }
    await sleep(250)
  }
  throw new Error('no CDP target')
}

const ws = new WebSocket(await target())
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', rej, { once: true })
})
let id = 1
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = id++
    pending.set(n, resolve)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.exceptionDetails ? null : r.result.value
}

await send('Runtime.enable')
await send('Page.enable')

let failures = 0
for (const [from, expected] of CASES) {
  await send('Page.navigate', { url: OLD + from })
  let landed = null
  for (let i = 0; i < 30; i++) {
    await sleep(300)
    landed = await evaluate(`location.href`)
    if (landed && !landed.startsWith(OLD)) break
  }
  const normalized = (landed || '').replace(/\/$/, '') || '/'
  const want = expected.replace(/\/$/, '')
  const ok = normalized === want
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${(OLD + from).padEnd(60)} -> ${landed}`)
  if (!ok) console.log(`        expected ${expected}`)
}

ws.close()
spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
await sleep(200)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  /* ignore */
}
console.log(`\n${CASES.length - failures}/${CASES.length} redirects correct`)
process.exit(failures ? 1 : 0)
