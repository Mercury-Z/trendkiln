/** Feasibility probe for the three upstream data sources. */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers } })
  return { status: res.status, text: await res.text() }
}

/* ---------------- 1. GitHub Trending ---------------- */
console.log('=== GitHub Trending ===')
for (const since of ['daily', 'weekly', 'monthly']) {
  try {
    const { status, text } = await get(`https://github.com/trending?since=${since}`)
    const articles = [...text.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)].map((m) => m[1])
    console.log(`${since.padEnd(8)} status=${status} bytes=${text.length} articles=${articles.length}`)
    if (articles.length) {
      const a = articles[0]
      const repo = a.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"/)?.[1]
      const stars = a.match(/\/stargazers"[^>]*>([\s\S]*?)<\/a>/)?.[1]?.replace(/[^\d]/g, '')
      const today = a.match(/([\d,]+)\s+stars?\s+(today|this week|this month)/)?.[0]
      const lang = a.match(/itemprop="programmingLanguage">([^<]*)</)?.[1]
      const desc = a.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1]?.trim().slice(0, 70)
      console.log(`   repo=${repo} stars=${stars} delta="${today}" lang=${lang}`)
      console.log(`   desc=${desc}`)
    }
  } catch (e) {
    console.log(`${since} FAILED: ${e.message}`)
  }
}

/* ---------------- 2. Artificial Analysis ---------------- */
console.log('\n=== Artificial Analysis ===')
const AA = [
  ['intelligence', 'https://artificialanalysis.ai/zh/models'],
  ['coding_index', 'https://artificialanalysis.ai/zh/agents/coding-agents'],
  ['text_to_image', 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image'],
  ['image_to_video', 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video'],
]
for (const [kind, url] of AA) {
  try {
    const { status, text } = await get(url)
    const probes = ['Claude Opus 5', 'GPT-6', 'self.__next_f', '__NEXT_DATA__', 'application/json', 'Kling', 'Seedance']
    const found = probes.filter((p) => text.includes(p))
    console.log(`${kind.padEnd(15)} status=${status} bytes=${text.length} contains: ${found.join(', ')}`)
  } catch (e) {
    console.log(`${kind} FAILED: ${e.message}`)
  }
}

/* ---------------- 3. RSS feeds ---------------- */
console.log('\n=== RSS feeds ===')
const FEEDS = [
  ['Simon Willison', 'https://simonwillison.net/atom/everything/'],
  ['OpenAI Blog', 'https://openai.com/blog/rss.xml'],
  ['GitHub Changelog', 'https://github.blog/changelog/feed/'],
  ['GitHub AI & ML', 'https://github.blog/ai-and-ml/github-copilot/feed/'],
  ['Latent Space', 'https://www.latent.space/feed'],
  ['Vercel', 'https://vercel.com/atom'],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['VS Code', 'https://code.visualstudio.com/feed.xml'],
  ['Google AI', 'https://blog.google/technology/ai/rss/'],
]
for (const [name, url] of FEEDS) {
  try {
    const { status, text } = await get(url, { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' })
    const items = (text.match(/<item[\s>]/g) || []).length || (text.match(/<entry[\s>]/g) || []).length
    console.log(`${name.padEnd(18)} status=${status} bytes=${String(text.length).padStart(7)} items=${items}`)
  } catch (e) {
    console.log(`${name.padEnd(18)} FAILED: ${e.message}`)
  }
}
