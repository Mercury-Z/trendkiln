/**
 * Debug helper: clicks a models kind tab and reports URL / router state.
 * Usage: node _tools/probe-kind.mjs <origin> [base]
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] || 'http://localhost:4175'
const BASE = process.argv[3] || ''
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9500 + Math.floor(Math.random() * 300)

const profile = mkdtempSync(join(tmpdir(), 'tk-pk-'))
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
  return r.exceptionDetails ? `<<err>>` : r.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: ORIGIN + BASE + '/models' })
await sleep(4000)

console.log('origin        :', ORIGIN + BASE)
console.log('loaded url    :', await evaluate(`location.href`))
console.log('rows (initial):', await evaluate(`document.querySelectorAll('main tbody tr').length`))
await evaluate(`[...document.querySelectorAll('main [role=tab]')].find(b=>b.textContent.trim()==='文生图').click()`)
await sleep(2500)
console.log('after click url:', await evaluate(`location.href`))
console.log('search         :', JSON.stringify(await evaluate(`location.search`)))
console.log('rows (after)   :', await evaluate(`document.querySelectorAll('main tbody tr').length`))
console.log('active tab     :', await evaluate(`document.querySelector('main [role=tab][aria-selected=true]').textContent.trim()`))

ws.close()
spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
await sleep(200)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  /* ignore */
}
