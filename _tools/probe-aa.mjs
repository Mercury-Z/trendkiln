/** Extracts the JSON-LD leaderboard payloads from each Artificial Analysis page. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const PAGES = {
  intelligence: 'https://artificialanalysis.ai/zh/models',
  coding_index: 'https://artificialanalysis.ai/zh/agents/coding-agents',
  coding_cost: 'https://artificialanalysis.ai/zh/agents/coding-agents',
  text_to_image: 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image',
  image_to_video: 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video',
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
}

for (const [kind, url] of Object.entries(PAGES)) {
  const html = await (await fetch(url, { headers: { 'user-agent': UA } })).text()
  const blocks = jsonLdBlocks(html)
  console.log(`\n===== ${kind} (${url}) — ${blocks.length} ld+json blocks =====`)
  for (const raw of blocks) {
    let doc
    try {
      doc = JSON.parse(raw)
    } catch {
      continue
    }
    const nodes = Array.isArray(doc) ? doc : [doc]
    for (const node of nodes) {
      if (!node?.data?.length) continue
      const sample = node.data[0]
      const keys = Object.keys(sample)
      console.log(`  @type=${node['@type'] ?? '?'} name="${String(node.name ?? '').slice(0, 60)}" rows=${node.data.length}`)
      console.log(`  row keys: ${keys.join(', ')}`)
      console.log(`  row[0]: ${JSON.stringify(sample).slice(0, 220)}`)
      console.log(`  row[1]: ${JSON.stringify(node.data[1]).slice(0, 220)}`)
    }
  }
}
