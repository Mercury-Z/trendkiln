/**
 * Trendkiln data collector.
 *
 * Refreshes the hard data only — GitHub Trending, the Artificial Analysis
 * leaderboards and the curated RSS feed — and rewrites demo/*.json, which is
 * what the statically generated site renders.
 *
 * Deliberately does no text generation: the "用途 / 优势 / 创新点" blocks are
 * reused from the frozen snapshot for repos it already covers, and fall back to
 * the repo description plus README excerpts for anything new.
 *
 * Usage: node collector/collect.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { collectGithub } from './sources/github.mjs'
import { collectModelKind, buildOrgContext, KIND_META } from './sources/models.mjs'
import { collectFeed } from './sources/feed.mjs'
import { buildDigest } from './lib/digest.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const DEMO = join(ROOT, 'demo')
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || ''

/**
 * `stars_delta` / `rank_delta` are measured against the previous snapshot, so a
 * run that lands shortly after the last one would publish near-zero deltas —
 * which is what happens whenever a code push triggers the workflow right after
 * a scheduled refresh. Below this interval the previous snapshot is reused
 * instead; `--force` overrides.
 */
const MIN_INTERVAL_MS = Number(process.env.COLLECT_MIN_INTERVAL_MS ?? 90 * 60 * 1000)

const META_FILE = 'collect-meta.json'

const GITHUB_WINDOWS = ['daily', 'weekly', 'monthly']
const FILE = {
  digest: 'digest.json',
  github: (w) => `github-${w}.json`,
  models: (k) => `models-${k}.json`,
  feed: 'feed.json',
  watchlist: 'watchlist.json',
}

function readJson(name, fallback = null) {
  const path = join(DEMO, name)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.warn(`  ! could not parse ${name}: ${error.message}`)
    return fallback
  }
}

function writeJson(name, value) {
  const path = join(DEMO, name)
  const text = `${JSON.stringify(value, null, 2)}\n`
  if (DRY_RUN) {
    console.log(`  (dry-run) would write ${name} (${text.length} bytes)`)
    return
  }
  writeFileSync(path, text, 'utf8')
}

/* ------------------------------------------------------------------ *
 * Carry-over maps built from the previous fixtures
 * ------------------------------------------------------------------ */

/** full_name -> frozen insight block (keeps the original's write-ups). */
function frozenInsightMap(previousGithub) {
  const map = new Map()
  for (const window of GITHUB_WINDOWS) {
    for (const item of previousGithub[window]?.items ?? []) {
      if (!map.has(item.full_name) && item.purpose) {
        map.set(item.full_name, {
          purpose: item.purpose,
          strengths: item.strengths,
          innovations: item.innovations,
          purpose_zh: item.purpose_zh,
          purpose_en: item.purpose_en,
          strengths_zh: item.strengths_zh,
          strengths_en: item.strengths_en,
          innovations_zh: item.innovations_zh,
          innovations_en: item.innovations_en,
          insights_source: item.insights_source,
        })
      }
    }
  }
  return map
}

/** model_name / display-name -> developer, so boards keep resolving orgs. */
function frozenOrgMap(previousModels) {
  return buildOrgContext(previousModels)
}

/* ------------------------------------------------------------------ *
 * Watchlist signals (the "近期信号" line on /watchlist)
 * ------------------------------------------------------------------ */
function deriveSignals(entry, github, models, feed) {
  const key = entry.target_key.toLowerCase()

  if (entry.target_type === 'repo') {
    for (const window of GITHUB_WINDOWS) {
      const hit = (github[window]?.items ?? []).find((i) => i.full_name.toLowerCase() === key)
      if (hit) return [`+${hit.stars_delta.toLocaleString('en-US')} stars`, `#${hit.rank}`]
    }
    return []
  }

  if (entry.target_type === 'model') {
    for (const [kind, payload] of Object.entries(models)) {
      const hit = (payload?.items ?? []).find((i) => i.model_name.toLowerCase() === key)
      if (hit) return [`#${hit.rank}`, kind]
    }
    return []
  }

  const out = []
  for (const item of feed?.items ?? []) {
    const text = `${item.title_text ?? ''} ${item.summary_text ?? ''}`.toLowerCase()
    if (text.includes(key)) {
      out.push((item.title_text ?? '').trim())
      if (out.length >= 3) break
    }
  }
  if (!out.length) {
    for (const window of GITHUB_WINDOWS) {
      const hit = (github[window]?.items ?? []).find((i) => i.full_name.toLowerCase().includes(key))
      if (hit) {
        out.push(hit.full_name)
        break
      }
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
async function main() {
  const startedAt = new Date()
  console.log(`Trendkiln collector — ${startedAt.toISOString()}${DRY_RUN ? ' (dry run)' : ''}`)

  const previous = {
    digest: readJson(FILE.digest),
    github: Object.fromEntries(GITHUB_WINDOWS.map((w) => [w, readJson(FILE.github(w))])),
    models: Object.fromEntries(KIND_META.map((k) => [k.id, readJson(FILE.models(k.id))])),
    feed: readJson(FILE.feed),
    watchlist: readJson(FILE.watchlist),
    meta: readJson(META_FILE),
  }

  // Freshness guard: reuse the previous snapshot when this run lands too soon
  // after the last real collection, otherwise the deltas collapse to ~0.
  const previousCollectedAt = previous.meta?.collected_at ? Date.parse(previous.meta.collected_at) : NaN
  const ageMs = Number.isNaN(previousCollectedAt) ? Infinity : startedAt.getTime() - previousCollectedAt
  const tooSoon = !FORCE && !ONLY && ageMs < MIN_INTERVAL_MS
  if (tooSoon) {
    console.log(
      `  last collection was ${Math.round(ageMs / 60000)} min ago (< ${Math.round(
        MIN_INTERVAL_MS / 60000,
      )} min) — reusing the previous snapshot; pass --force to collect anyway`,
    )
  }
  const wants = (name) => !tooSoon && (!ONLY || ONLY.split(',').includes(name))

  const frozenInsights = frozenInsightMap(previous.github)
  const orgContext = frozenOrgMap(previous.models)
  console.log(
    `  carry-over: ${frozenInsights.size} repo write-ups, ${orgContext.byName.size} known model orgs`,
  )

  /* --- GitHub --- */
  const github = {}
  for (const window of GITHUB_WINDOWS) {
    if (!wants('github')) {
      github[window] = previous.github[window]
      console.log(`  github/${window} … reused${tooSoon ? ' (freshness guard)' : ' (--only)'}`)
      continue
    }
    process.stdout.write(`  github/${window} … `)
    try {
      github[window] = await collectGithub(window, previous.github[window], frozenInsights)
      console.log(`${github[window].items.length} repos`)
    } catch (error) {
      console.log(`FAILED (${error.message}) — keeping previous`)
      if (!previous.github[window]) throw error
      github[window] = previous.github[window]
    }
  }

  /* --- Models --- */
  const models = {}
  for (const meta of KIND_META) {
    if (!wants('models')) {
      models[meta.id] = previous.models[meta.id]
      console.log(`  models/${meta.id} … reused${tooSoon ? ' (freshness guard)' : ' (--only)'}`)
      continue
    }
    process.stdout.write(`  models/${meta.id} … `)
    try {
      models[meta.id] = await collectModelKind(meta, previous.models[meta.id], orgContext)
      console.log(`${models[meta.id].items.length} rows`)
    } catch (error) {
      console.log(`FAILED (${error.message}) — keeping previous`)
      if (!previous.models[meta.id]) throw error
      models[meta.id] = previous.models[meta.id]
    }
  }

  /* --- Feed --- */
  let feed
  if (!wants('feed')) {
    feed = previous.feed
    console.log(`  feed … reused${tooSoon ? ' (freshness guard)' : ' (--only)'}`)
  } else {
    process.stdout.write('  feed … ')
    try {
      feed = await collectFeed(previous.feed)
      console.log(`${feed.items.length} items`)
    } catch (error) {
      console.log(`FAILED (${error.message}) — keeping previous`)
      if (!previous.feed) throw error
      feed = previous.feed
    }
  }

  /* --- Digest --- */
  const digest = buildDigest(github.daily, models, feed)
  console.log(`  digest … ${digest.items.length} items (${[...new Set(digest.items.map((i) => i.type))].join(', ')})`)

  /* --- Watchlist --- */
  const watchlist = {
    source: 'db',
    items: (previous.watchlist?.items ?? []).map((entry) => {
      const signals = deriveSignals(entry, github, models, feed)
      return { ...entry, signals, last_signal_at: signals.length ? startedAt.toISOString() : entry.last_signal_at }
    }),
  }
  console.log(`  watchlist … ${watchlist.items.length} entries`)

  /* --- Write --- */
  writeJson(FILE.digest, digest)
  for (const window of GITHUB_WINDOWS) writeJson(FILE.github(window), github[window])
  for (const meta of KIND_META) writeJson(FILE.models(meta.id), models[meta.id])
  writeJson(FILE.feed, feed)
  writeJson(FILE.watchlist, watchlist)
  writeJson(META_FILE, {
    // kept as the last time data was actually fetched, so the freshness guard
    // still applies after a run that only reused the previous snapshot.
    collected_at: tooSoon ? previous.meta?.collected_at : startedAt.toISOString(),
    last_run_at: startedAt.toISOString(),
    last_run_collected: !tooSoon,
    duration_ms: Date.now() - startedAt.getTime(),
    counts: {
      github: Object.fromEntries(GITHUB_WINDOWS.map((w) => [w, github[w].items.length])),
      models: Object.fromEntries(KIND_META.map((k) => [k.id, models[k.id].items.length])),
      feed: feed.items.length,
      digest: digest.items.length,
    },
  })

  console.log(`done in ${Date.now() - startedAt.getTime()}ms`)
}

main().catch((error) => {
  console.error('\ncollector failed:', error)
  process.exit(1)
})
