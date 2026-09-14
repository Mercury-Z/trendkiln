/** Lists the JSON-LD datasets (name / rows / value keys) for the remaining boards. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const PAGES = {
  coding_index: 'https://artificialanalysis.ai/zh/agents/coding-agents',
  text_to_image: 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image',
  image_to_video: 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video',
}

const SKIP = new Set(['detailsUrl', 'label'])

for (const [kind, url] of Object.entries(PAGES)) {
  console.log(`\n########## ${kind} ##########`)
  let html
  try {
    html = await (await fetch(url, { headers: { 'user-agent': UA } })).text()
  } catch (e) {
    console.log('  fetch failed:', e.message)
    continue
  }
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  for (const raw of blocks) {
    let doc
    try {
      doc = JSON.parse(raw)
    } catch {
      continue
    }
    for (const node of Array.isArray(doc) ? doc : [doc]) {
      if (!node?.data?.length) continue
      const keys = Object.keys(node.data[0]).filter((k) => !SKIP.has(k))
      const v = node.data[0][keys[0]]
      const scalar = typeof v === 'number' ? v : Array.isArray(v) ? `[${v.length} props]` : typeof v
      console.log(`  "${node.name}" rows=${String(node.data.length).padStart(3)} keys=[${keys.join(',')}] sample=${scalar}`)
    }
  }
}
