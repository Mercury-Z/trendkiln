import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'devalue'

const ORIGIN = 'https://trendkiln.pages.dev'
const OUT = 'E:/复刻钟政ds41f/_recon'
mkdirSync(join(OUT, 'raw'), { recursive: true })
mkdirSync(join(OUT, 'decoded'), { recursive: true })

const routes = ['/', '/github', '/models', '/feed', '/watchlist', '/settings']

const identity = (v) => v
const revivers = {
  ShallowReactive: identity,
  Reactive: identity,
  Ref: identity,
  ShallowRef: identity,
  EmptyRef: identity,
  EmptyShallowRef: identity,
  NuxtError: identity,
}

const htmlUnescape = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const assetSet = new Set()

for (const route of routes) {
  const name = route === '/' ? 'index' : route.slice(1)
  const res = await fetch(ORIGIN + route, { headers: { 'accept-language': 'zh-CN,zh;q=0.9' } })
  const html = await res.text()
  writeFileSync(join(OUT, 'raw', `${name}.html`), html, 'utf8')

  for (const m of html.matchAll(/(?:href|src)="(\/_nuxt\/[^"]+)"/g)) assetSet.add(m[1])
  for (const m of html.matchAll(/(?:href|src)="(\/logos\/[^"]+)"/g)) assetSet.add(m[1])

  const pm = html.match(
    /<script type="application\/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">([\s\S]*?)<\/script>/,
  )
  if (!pm) {
    console.log(`${name}: NO PAYLOAD`)
    continue
  }
  const raw = htmlUnescape(pm[1])
  try {
    const data = parse(raw, revivers)
    writeFileSync(join(OUT, 'decoded', `${name}.json`), JSON.stringify(data, null, 2), 'utf8')
    console.log(`${name}: OK ${JSON.stringify(data).length} chars`)
  } catch (e) {
    console.log(`${name}: FAIL ${e.message}`)
    writeFileSync(join(OUT, 'raw', `${name}.payload.txt`), raw, 'utf8')
  }
}

writeFileSync(join(OUT, 'assets.txt'), [...assetSet].sort().join('\n'), 'utf8')
console.log('assets:', assetSet.size)
