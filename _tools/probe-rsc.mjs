/** Probes the Next.js RSC payload for the image/video leaderboards. */
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
  ['text_to_image', 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image', 'GPT Image 2.5 Flare'],
  ['image_to_video', 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video', 'Seedance'],
]) {
  console.log(`\n########## ${kind} ##########`)
  const html = await (await fetch(url, { headers: { 'user-agent': UA } })).text()
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)<\/script>/g)]
  console.log('rsc chunks:', chunks.length)
  const text = rscText(html)
  console.log('rsc text length:', text.length)
  const i = text.indexOf(needle)
  console.log(`index of "${needle}":`, i)
  if (i > 0) console.log(text.slice(Math.max(0, i - 700), i + 500))
  else {
    // fall back to searching the raw html
    const j = html.indexOf(needle)
    console.log(`raw html index of "${needle}":`, j)
    if (j > 0) console.log(html.slice(Math.max(0, j - 600), j + 400))
  }
}
