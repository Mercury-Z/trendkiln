/**
 * GitHub Trending collector.
 *
 * The ranking and the "stars today/this week/this month" figure come from the
 * Trending page (the same thing the original site labels "以 Trending 为主").
 * Repo metadata (exact star/fork counts, topics, language) comes from the REST
 * API, which also gives us READMEs for the insight fallback.
 */
import { execFileSync } from 'node:child_process'
import { fetchJson, fetchText, mapPool } from '../lib/http.mjs'

const SINCE = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' }
const DELTA_LABEL = { daily: 'today', weekly: 'this week', monthly: 'this month' }

let cachedToken
function token() {
  if (cachedToken !== undefined) return cachedToken
  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN
    return cachedToken
  }
  try {
    cachedToken = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  } catch {
    cachedToken = null
  }
  return cachedToken
}

function apiHeaders() {
  const t = token()
  return t ? { authorization: `Bearer ${t}` } : {}
}

/** Parses one `<article class="Box-row">` block from the Trending page. */
function parseArticle(block) {
  // SVGs inside the star/fork links contain digits that would corrupt the counts.
  const html = block.replace(/<svg[\s\S]*?<\/svg>/g, '')

  const fullName = html.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"/)?.[1]?.trim()
  if (!fullName) return null

  const description =
    html
      .match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1]
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim() ?? ''

  const language = html.match(/itemprop="programmingLanguage">([^<]*)</)?.[1]?.trim() ?? ''
  const stars = Number(html.match(/\/stargazers"[^>]*>\s*([\d,]+)\s*</)?.[1]?.replace(/,/g, '') ?? 0)
  const forks = Number(html.match(/\/forks"[^>]*>\s*([\d,]+)\s*</)?.[1]?.replace(/,/g, '') ?? 0)
  const deltaMatch = html.match(/([\d,]+)\s+stars?\s+(today|this week|this month)/)
  const trendingDelta = deltaMatch ? Number(deltaMatch[1].replace(/,/g, '')) : 0

  return { full_name: fullName, description, language, stars, forks, trendingDelta }
}

async function fetchTrending(since) {
  const html = await fetchText(`https://github.com/trending?since=${since}`)
  const blocks = [...html.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)].map((m) => m[1])
  return blocks.map(parseArticle).filter(Boolean)
}

async function fetchRepoMeta(fullName) {
  const repo = await fetchJson(`https://api.github.com/repos/${fullName}`, { headers: apiHeaders() })
  return {
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    language: repo.language ?? '',
    description: repo.description ?? '',
    html_url: repo.html_url,
    pushed_at: repo.pushed_at,
  }
}

async function fetchReadme(fullName) {
  try {
    const text = await fetchText(`https://api.github.com/repos/${fullName}/readme`, {
      headers: { ...apiHeaders(), accept: 'application/vnd.github.raw' },
      retries: 2,
    })
    return text
  } catch {
    return ''
  }
}

/** Turns markdown into a short plain-text excerpt suitable for a card. */
function readmeExcerpt(markdown, { offset = 0, maxLength = 230 } = {}) {
  const clean = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const slice = clean.slice(offset, offset + maxLength).trim()
  if (!slice) return ''
  return (offset > 0 ? '…' : '') + slice + (offset + maxLength < clean.length ? '…' : '')
}

/**
 * Builds the three insight blocks.
 *
 * The original generates these from the README with a language model. This
 * collector deliberately does no generation: repos already covered by the
 * frozen snapshot keep those write-ups, everything else falls back to the repo
 * description plus README excerpts, and `insights_source` records which.
 */
function buildInsights(meta, markdown, frozen) {
  if (frozen) {
    return {
      purpose: frozen.purpose,
      strengths: frozen.strengths,
      innovations: frozen.innovations,
      purpose_zh: frozen.purpose_zh,
      purpose_en: frozen.purpose_en,
      strengths_zh: frozen.strengths_zh,
      strengths_en: frozen.strengths_en,
      innovations_zh: frozen.innovations_zh,
      innovations_en: frozen.innovations_en,
      insights_source: frozen.insights_source ?? 'readme',
    }
  }

  const description = meta.description || ''
  const strengths = readmeExcerpt(markdown, { offset: 0 })
  const innovations = readmeExcerpt(markdown, { offset: 400 })

  const zh = (text) => ({ zh: text, en: text })
  return {
    purpose: zh(description),
    strengths: zh(strengths),
    innovations: zh(innovations),
    purpose_zh: description,
    purpose_en: description,
    strengths_zh: strengths,
    strengths_en: strengths,
    innovations_zh: innovations,
    innovations_en: innovations,
    insights_source: 'readme-excerpt',
  }
}

/**
 * @param {'daily'|'weekly'|'monthly'} window
 * @param {object} previous previous fixture for the same window (or null)
 * @param {Map<string, object>} frozenInsights insights carried over from the frozen snapshot
 */
export async function collectGithub(window, previous, frozenInsights) {
  const since = SINCE[window]
  const trending = await fetchTrending(since)
  const snapshotAt = new Date().toISOString()

  const previousByRepo = new Map((previous?.items ?? []).map((item) => [item.full_name, item]))

  const enriched = await mapPool(trending, 4, async (row) => {
    let meta
    try {
      meta = await fetchRepoMeta(row.full_name)
    } catch {
      meta = null
    }
    return { row, meta }
  })

  const items = []
  for (let index = 0; index < enriched.length; index++) {
    const entry = enriched[index]
    if (!entry || entry.__error) continue
    const { row, meta } = entry

    const stars = meta?.stars ?? row.stars
    const forks = meta?.forks ?? row.forks
    const prev = previousByRepo.get(row.full_name)

    // Prefer a genuine snapshot-to-snapshot delta; fall back to Trending's own
    // "stars today/this week/this month" figure on first sight of a repo.
    const stars_delta = prev ? Math.max(0, stars - prev.stars) : row.trendingDelta
    const forks_delta = prev ? Math.max(0, forks - prev.forks) : 0

    const needsReadme = !frozenInsights.has(row.full_name)
    const markdown = needsReadme ? await fetchReadme(row.full_name) : ''
    const insights = buildInsights(
      { description: meta?.description || row.description },
      markdown,
      frozenInsights.get(row.full_name),
    )

    items.push({
      rank: index + 1,
      full_name: row.full_name,
      description: meta?.description || row.description,
      language: meta?.language || row.language,
      topics: (meta?.topics ?? []).slice(0, 20),
      stars,
      stars_delta,
      forks,
      forks_delta,
      html_url: meta?.html_url ?? `https://github.com/${row.full_name}`,
      snapshot_at: snapshotAt,
      ...insights,
    })
  }

  return {
    source: 'db',
    window,
    windows: [
      { id: 'daily', hasData: true },
      { id: 'weekly', hasData: true },
      { id: 'monthly', hasData: true },
    ],
    items,
  }
}
