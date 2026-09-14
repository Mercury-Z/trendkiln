/** Finds the most robust way to resolve a model's developer (org). */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const rscText = (html) => {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)<\/script>/g)].map((m) => m[1])
  return chunks
    .map((c) =>
      c
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    )
    .join('')
}

console.log('########## intelligence RSC: creator shapes ##########')
const html = await (await fetch('https://artificialanalysis.ai/zh/models', { headers: { 'user-agent': UA } })).text()
const text = rscText(html)
for (const pat of ['"creator":{"name"', '"creator":{"id"', '"modelCreator"', '"organization"']) {
  const n = (text.match(new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  console.log(`  ${pat} -> ${n}`)
  if (n) {
    const i = text.indexOf(pat.slice(1, -1) === '' ? pat : pat.slice(1).replace(/\\/g, ''))
    const j = text.indexOf(pat.replace(/^"/, '').replace(/"$/, ''))
    const at = text.indexOf(pat.slice(1, -1))
    if (at > 0) console.log('     ctx:', text.slice(Math.max(0, at - 300), at + 300).replace(/\n/g, ' '))
  }
}

console.log('\n########## model detail page JSON-LD ##########')
const detail = await (await fetch('https://artificialanalysis.ai/zh/models/claude-opus-5', { headers: { 'user-agent': UA } })).text()
const ld = [...detail.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
console.log('ld blocks:', ld.length)
for (const raw of ld) {
  try {
    const doc = JSON.parse(raw)
    for (const node of Array.isArray(doc) ? doc : [doc]) {
      if (node['@type'] === 'Organization' || node.creator || node.brand || node.author) {
        console.log('  candidate:', JSON.stringify(node).slice(0, 300))
      }
    }
  } catch {
    /* ignore */
  }
}
