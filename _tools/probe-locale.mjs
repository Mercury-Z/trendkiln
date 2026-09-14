/**
 * Read-only locale probe: compares the language-toggle behaviour of the
 * original site and the replica. Performs no server mutations.
 *
 * Usage: node _tools/probe-locale.mjs <origin> [origin2]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGINS = process.argv.slice(2)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9334

const profile = mkdtempSync(join(tmpdir(), 'tk-probe-'))
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

async function targetUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* retry */
    }
    await sleep(250)
  }
  throw new Error('CDP endpoint unavailable')
}

const ws = new WebSocket(await targetUrl())
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', rej, { once: true })
})

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
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
  if (r.exceptionDetails) return `<<error: ${r.exceptionDetails.exception?.description?.split('\n')[0]}>>`
  return r.result.value
}
async function goto(url) {
  await send('Page.navigate', { url })
  await sleep(2000)
}

await send('Runtime.enable')
await send('Page.enable')

for (const origin of ORIGINS) {
  console.log(`\n================ ${origin} ================`)
  await goto(origin + '/')
  console.log('nav before        :', JSON.stringify(await evaluate(`[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`)))
  console.log('lang buttons      :', JSON.stringify(await evaluate(`[...document.querySelectorAll('header button')].map(b=>b.textContent.trim()+'|'+b.className)`)))
  console.log('html lang attr    :', JSON.stringify(await evaluate(`document.documentElement.lang`)))
  console.log('cookie before     :', JSON.stringify(await evaluate(`document.cookie`)))

  const clicked = await evaluate(`(()=>{const b=[...document.querySelectorAll('header button')].find(x=>x.textContent.trim()==='English');if(!b)return 'not-found';b.click();return 'clicked'})()`)
  console.log('click English     :', clicked)
  await sleep(1200)
  console.log('nav after         :', JSON.stringify(await evaluate(`[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`)))
  console.log('lang buttons after:', JSON.stringify(await evaluate(`[...document.querySelectorAll('header button')].map(b=>b.textContent.trim()+'|'+b.className)`)))
  console.log('h1 after          :', JSON.stringify(await evaluate(`document.querySelector('main h1')?.textContent.trim()`)))
  console.log('cookie after      :', JSON.stringify(await evaluate(`document.cookie`)))
  console.log('localStorage keys :', JSON.stringify(await evaluate(`Object.keys(localStorage)`)))

  await goto(origin + '/')
  console.log('nav after reload  :', JSON.stringify(await evaluate(`[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim())`)))
}

ws.close()
edge.kill()
await sleep(300)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  /* best effort */
}
