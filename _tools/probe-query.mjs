/**
 * Debug helper: reports how a directly-loaded query-variant URL behaves after
 * hydration (router query vs window.location).
 *
 * Usage: node _tools/probe-query.mjs <origin> <route>
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] || 'http://localhost:4173'
const ROUTE = process.argv[3] || '/github?window=weekly'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9900 + Math.floor(Math.random() * 80)

const profile = mkdtempSync(join(tmpdir(), 'tk-pq-'))
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
    const { resolve } = pending.get(m.id)
    pending.delete(m.id)
    resolve(m.result)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = id++
    pending.set(n, { resolve })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.exceptionDetails ? `<<err ${r.exceptionDetails.exception?.description?.split('\n')[0]}>>` : r.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: ORIGIN + ROUTE })
await sleep(4000)

console.log(`route: ${ROUTE}`)
console.log('location.href        :', await evaluate(`location.href`))
console.log('location.search      :', await evaluate(`location.search`))
console.log('rows rendered        :', await evaluate(`document.querySelectorAll('main tbody tr, main .gh-card').length`))
console.log('selected window chip :', await evaluate(`document.querySelector('main [role=tab][aria-selected=true]')?.textContent.trim()`))
console.log(
  'router query (via app):',
  await evaluate(`(()=>{try{return JSON.stringify(window.useNuxtApp?.().$router.currentRoute.value.query??null)}catch(e){return 'n/a'}})()`),
)

ws.close()
spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
await sleep(200)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  /* ignore */
}
