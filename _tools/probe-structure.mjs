/** Structural probe: dumps enough of each upstream page to write parsers. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const get = async (u) => (await fetch(u, { headers: { 'user-agent': UA } })).text()

console.log('################ GitHub Trending article ################')
const gh = await get('https://github.com/trending?since=daily')
const articles = [...gh.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)].map((m) => m[1])
const compact = articles[0].replace(/\n\s*/g, ' ').replace(/\s{2,}/g, ' ')
console.log(compact.slice(0, 2200))

console.log('\n\n################ Artificial Analysis (around a model name) ################')
const aa = await get('https://artificialanalysis.ai/zh/models')
const idx = aa.indexOf('Claude Opus 5')
console.log('first index of "Claude Opus 5":', idx)
if (idx > 0) {
  console.log('--- context around it ---')
  console.log(aa.slice(Math.max(0, idx - 900), idx + 900))
}
console.log('\n--- next_f chunk count:', (aa.match(/self\.__next_f\.push/g) || []).length)
const firstChunk = aa.match(/self\.__next_f\.push\(\[1,"([\s\S]{0,300})/)
console.log('--- first RSC chunk head ---')
console.log(firstChunk?.[1]?.slice(0, 300))
