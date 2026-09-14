/**
 * Live A/B harness: renders the same route on the original site and on the
 * local SSR build and compares the #__nuxt markup.
 *
 * Usage: node _tools/compare-live.mjs [localOrigin] [originalOrigin]
 */
const LOCAL = process.argv[2] || 'http://127.0.0.1:3000'
const ORIGINAL = process.argv[3] || 'https://trendkiln.pages.dev'

const ROUTES = [
  '/',
  '/github',
  '/github?window=weekly',
  '/github?window=monthly',
  '/github?layout=list',
  '/models',
  '/models?kind=coding_index',
  '/models?kind=coding_cost',
  '/models?kind=text_to_image',
  '/models?kind=image_to_video',
  '/feed',
  '/feed?filter=unread',
  '/feed?filter=saved',
  '/watchlist',
  '/settings',
]

function extractNuxt(html) {
  const start = html.indexOf('<div id="__nuxt">')
  if (start < 0) return null
  let end = html.indexOf('<div id="teleports">', start)
  if (end < 0) end = html.indexOf('<script type="application/json"', start)
  return html.slice(start, end < 0 ? undefined : end)
}

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

function tokenize(html) {
  return html.match(/<[^>]+>|[^<]+/g) ?? []
}

async function grab(origin, route) {
  const res = await fetch(origin + route, { headers: { 'accept-language': 'zh-CN,zh;q=0.9' } })
  const html = await res.text()
  return { status: res.status, nuxt: extractNuxt(html) }
}

let sum = 0
let n = 0
for (const route of ROUTES) {
  try {
    const [a, b] = await Promise.all([grab(ORIGINAL, route), grab(LOCAL, route)])
    if (!a.nuxt || !b.nuxt) {
      console.log(`${route.padEnd(32)} EXTRACT FAIL o=${!!a.nuxt} l=${!!b.nuxt} (status ${a.status}/${b.status})`)
      continue
    }
    const na = normalize(a.nuxt)
    const nb = normalize(b.nuxt)
    const ta = tokenize(na)
    const tb = tokenize(nb)
    const counts = new Map()
    tb.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
    let matched = 0
    for (const t of ta) {
      const c = counts.get(t) ?? 0
      if (c > 0) {
        counts.set(t, c - 1)
        matched++
      }
    }
    const extra = [...counts.entries()].reduce((acc, [, c]) => acc + c, 0)
    const score = (matched / Math.max(ta.length, 1)) * 100
    sum += score
    n++
    const exact = na === nb
    console.log(
      `${route.padEnd(32)} ${exact ? 'IDENTICAL' : `differs  `} tokens=${String(ta.length).padStart(5)}/${String(
        tb.length,
      ).padStart(5)} fidelity=${score.toFixed(2)}% missing=${ta.length - matched} extra=${extra}`,
    )
  } catch (e) {
    console.log(`${route.padEnd(32)} ERROR ${e.message}`)
  }
}
if (n) console.log(`\nAverage: ${(sum / n).toFixed(2)}% over ${n} routes`)
