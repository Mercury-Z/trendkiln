import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parse } from 'devalue'

const recon = 'E:/复刻钟政ds41f/_recon/payload'
const outDir = 'E:/复刻钟政ds41f/_recon/decoded'
mkdirSync(outDir, { recursive: true })

function htmlUnescape(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const identity = (v) => v
const revivers = {
  ShallowReactive: identity,
  Reactive: identity,
  Ref: identity,
  ShallowRef: identity,
  EmptyRef: identity,
  EmptyShallowRef: identity,
  NuxtError: identity,
  ShallowRefImpl: identity,
}

for (const f of readdirSync(recon)) {
  if (!f.endsWith('.json')) continue
  let raw = readFileSync(join(recon, f), 'utf8').replace(/^\uFEFF/, '')
  raw = htmlUnescape(raw)
  try {
    const data = parse(raw, revivers)
    const out = join(outDir, basename(f))
    writeFileSync(out, JSON.stringify(data, null, 2), 'utf8')
    console.log(`${f}: OK (${JSON.stringify(data).length} chars)`)
  } catch (e) {
    console.log(`${f}: FAIL ${e.message}`)
    writeFileSync(join(outDir, basename(f) + '.rawtxt'), raw, 'utf8')
  }
}
