/** Checks whether the LLM board pages expose creator/org info in their RSC payload. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

function rscText(html) {
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

for (const [kind, url, needle] of [
  ['intelligence', 'https://artificialanalysis.ai/zh/models', 'Claude Opus 5'],
  ['coding_index', 'https://artificialanalysis.ai/zh/agents/coding-agents', 'Claude Code'],
]) {
  console.log(`\n########## ${kind} ##########`)
  const html = await (await fetch(url, { headers: { 'user-agent': UA } })).text()
  const text = rscText(html)
  console.log('rsc len', text.length, '| "creator" occurrences:', (text.match(/"creator"/g) || []).length)
  const i = text.indexOf(needle)
  console.log(`index of "${needle}":`, i)
  if (i > 0) {
    const window = text.slice(Math.max(0, i - 400), i + 900)
    console.log(window)
  }
}
