/**
 * Curated feed collector.
 *
 * Mirrors the original's source list. Note that the original also translates
 * every headline into Chinese with a language model; this collector does not
 * generate text, so both locales carry the publisher's own wording.
 */
import { fetchText, mapPool } from '../lib/http.mjs'
import { parseFeed } from '../lib/rss.mjs'

export const SOURCES = [
  { id: '1', name: 'VS Code Blog', url: 'https://code.visualstudio.com/feed.xml' },
  { id: '2', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  { id: '3', name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml' },
  { id: '4', name: 'GitHub Changelog', url: 'https://github.blog/changelog/feed/' },
  { id: '5', name: 'GitHub AI & ML', url: 'https://github.blog/ai-and-ml/feed/' },
  { id: '6', name: 'Latent Space', url: 'https://www.latent.space/feed' },
  { id: '7', name: 'Vercel Blog', url: 'https://vercel.com/atom' },
  { id: '8', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
  { id: '9', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/' },
  { id: '10', name: 'openai/codex releases', url: 'https://github.com/openai/codex/releases.atom' },
]

const FEED_LIMIT = 80
const SUMMARY_LIMIT = 320

function clip(text, limit = SUMMARY_LIMIT) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

async function collectSource(source) {
  try {
    const xml = await fetchText(source.url, {
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      timeoutMs: 25000,
    })
    return parseFeed(xml).map((entry) => ({ ...entry, source }))
  } catch (error) {
    console.warn(`  ! ${source.name}: ${error.message}`)
    return []
  }
}

/**
 * @param {object} previous previous feed fixture (used to keep ids and the
 *   per-item read / saved flags stable across runs)
 */
export async function collectFeed(previous) {
  const batches = await mapPool(SOURCES, 5, collectSource)
  const entries = batches.flat().filter((e) => e && !e.__error)

  const previousByUrl = new Map((previous?.items ?? []).map((item) => [item.url, item]))
  const usedIds = new Set()
  let nextId = Math.max(0, ...(previous?.items ?? []).map((item) => Number(item.id) || 0)) + 1

  const seen = new Set()
  const deduped = []
  for (const entry of entries) {
    if (seen.has(entry.url)) continue
    seen.add(entry.url)
    deduped.push(entry)
  }

  deduped.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))

  const items = deduped.slice(0, FEED_LIMIT).map((entry, index) => {
    const prev = previousByUrl.get(entry.url)
    let id
    if (prev && !usedIds.has(prev.id)) {
      id = prev.id
    } else {
      while (usedIds.has(String(nextId))) nextId++
      id = String(nextId++)
    }
    usedIds.add(id)

    const title = clip(entry.title, 200)
    const summary = clip(entry.summary)
    return {
      id,
      title: { zh: title, en: title },
      summary: { zh: summary, en: summary },
      title_zh: title,
      title_en: title,
      summary_zh: summary,
      summary_en: summary,
      title_text: title,
      summary_text: summary,
      source_id: entry.source.id,
      source_name: entry.source.name,
      url: entry.url,
      published_at: entry.publishedAt ?? new Date(Date.now() - index * 3600_000).toISOString(),
      tags: entry.tags ?? [],
      read_at: prev?.read_at ?? null,
      saved: prev?.saved ?? false,
    }
  })

  return { source: 'db', items }
}
