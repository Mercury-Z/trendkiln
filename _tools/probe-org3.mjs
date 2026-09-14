/** Locates creator/org info in the intelligence board's RSC payload. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

async function get(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } })
      if (res.ok) return await res.text()
    } catch (e) {
      if (i === tries) throw e
    }
    await new Promise((r) => setTimeout(r, 1500 * i))
  }
  throw new Error('unreachable')
}

const rscText = (html) =>
  [...html.matchAll(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)<\/script>/g)]
    .map((m) => m[1])
    .map((c) =>
      c
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    )
    .join('')

const html = await get('https://artificialanalysis.ai/zh/models')
const text = rscText(html)
console.log('rsc len', text.length)

const needles = ['"creator":{"name":"Anthropic"', '"creator":{"agent"', '"creator":{', 'Anthropic']
for (const n of needles) {
  const count = text.split(n).length - 1
  console.log(`  ${JSON.stringify(n)} -> ${count}`)
}

// Show context of the first creator object that sits next to a model label.
const re = /"creator":\{[^}]{0,180}\}/g
let shown = 0
for (const m of text.matchAll(re)) {
  const at = m.index
  const around = text.slice(Math.max(0, at - 260), at + m[0].length + 90).replace(/\n/g, ' ')
  if (/Opus|Fable|Astra|GLM|Kimi/.test(around)) {
    console.log('\n--- creator context ---')
    console.log(around)
    if (++shown >= 2) break
  }
}
if (!shown) {
  console.log('\nno creator object adjacent to a model label; sample creator objects:')
  let n = 0
  for (const m of text.matchAll(re)) {
    console.log('  ', m[0].slice(0, 160))
    if (++n >= 4) break
  }
}
