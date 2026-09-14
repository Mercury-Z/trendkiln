/**
 * Fidelity harness: compares the replicated pages against the originals
 * captured from treandkiln.pages.dev.
 *
 * Usage: node _tools/compare.mjs [baseUrl]
 *   baseUrl defaults to the prerendered output served from .output/public
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROUTES = ['/', '/github', '/models', '/feed', '/watchlist', '/settings']
const ORIGINAL = 'E:/复刻钟政ds41f/_recon/raw'
const OUT = 'E:/复刻钟政ds41f/_recon/compare'
const LOCAL_DIR = 'E:/复刻钟政ds41f/trendkiln/.output/public'
mkdirSync(OUT, { recursive: true })

const argBase = process.argv[2]

function extractNuxt(html) {
  const start = html.indexOf('<div id="__nuxt">')
  if (start < 0) return null
  // Stop right before the teleport host so the Nuxt runtime config script and
  // the devalue payload are excluded from the comparison.
  let end = html.indexOf('<div id="teleports">', start)
  if (end < 0) end = html.indexOf('<script type="application/json"', start)
  return html.slice(start, end < 0 ? undefined : end)
}

/** Normalise Vue's fragment markers + insignificant whitespace. */
function normalize(html) {
  return html
    .replace(/<!--\[\]?-->/g, '')
    .replace(/<!---->/g, '')
    .replace(/<!--teleport start-->/g, '')
    .replace(/<!--teleport end-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
}

/** Split into comparable tokens: tags and text runs. */
function tokenize(html) {
  return html.match(/<[^>]+>|[^<]+/g) ?? []
}

function diffStats(a, b) {
  const at = tokenize(a)
  const bt = tokenize(b)
  const setB = new Map()
  bt.forEach((t, i) => {
    if (!setB.has(t)) setB.set(t, [])
    setB.get(t).push(i)
  })
  let matched = 0
  const onlyA = []
  const usedB = new Set()
  for (const t of at) {
    const candidates = setB.get(t)
    const hit = candidates?.find((i) => !usedB.has(i))
    if (hit !== undefined) {
      usedB.add(hit)
      matched++
    } else {
      onlyA.push(t)
    }
  }
  const onlyB = bt.filter((_, i) => !usedB.has(i))
  return { aTokens: at.length, bTokens: bt.length, matched, onlyA, onlyB }
}

function localPath(route) {
  if (route === '/') return join(LOCAL_DIR, 'index.html')
  return join(LOCAL_DIR, route.slice(1), 'index.html')
}

let totalScore = 0
let counted = 0

for (const route of ROUTES) {
  const name = route === '/' ? 'index' : route.slice(1)
  let localHtml
  if (argBase) {
    try {
      localHtml = await (await fetch(argBase.replace(/\/$/, '') + route)).text()
    } catch (e) {
      console.log(`${name.padEnd(10)} FETCH FAIL ${e.message}`)
      continue
    }
  } else {
    const p = localPath(route)
    if (!existsSync(p)) {
      console.log(`${name.padEnd(10)} MISSING ${p}`)
      continue
    }
    localHtml = readFileSync(p, 'utf8')
  }

  const originalHtml = readFileSync(join(ORIGINAL, `${name}.html`), 'utf8')
  const a = extractNuxt(originalHtml)
  const b = extractNuxt(localHtml)
  if (!a || !b) {
    console.log(`${name.padEnd(10)} EXTRACT FAIL original=${!!a} local=${!!b}`)
    continue
  }
  const na = normalize(a)
  const nb = normalize(b)
  const exact = na === nb
  const stats = diffStats(na, nb)
  const score = (stats.matched / Math.max(stats.aTokens, 1)) * 100
  totalScore += score
  counted++

  writeFileSync(join(OUT, `${name}.original.txt`), na.replace(/></g, '>\n<'), 'utf8')
  writeFileSync(join(OUT, `${name}.local.txt`), nb.replace(/></g, '>\n<'), 'utf8')
  writeFileSync(
    join(OUT, `${name}.only-original.txt`),
    stats.onlyA.slice(0, 200).join('\n'),
    'utf8',
  )
  writeFileSync(join(OUT, `${name}.only-local.txt`), stats.onlyB.slice(0, 200).join('\n'), 'utf8')

  console.log(
    `${name.padEnd(10)} exact=${exact ? 'YES' : 'no '}  tokens o=${String(stats.aTokens).padStart(5)} l=${String(
      stats.bTokens,
    ).padStart(5)}  matched=${String(stats.matched).padStart(5)}  fidelity=${score.toFixed(2)}%  missing=${stats.onlyA.length} extra=${stats.onlyB.length}`,
  )
}

if (counted) console.log(`\nAverage DOM fidelity: ${(totalScore / counted).toFixed(2)}%`)
