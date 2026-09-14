/**
 * Artificial Analysis leaderboard collector.
 *
 * Two extraction paths are needed because the boards are published differently:
 *  - the LLM boards expose a schema.org `Dataset` JSON-LD block with one value
 *    key per metric (`artificialAnalysisIntelligenceIndex`, `codingAgentsIndex`,
 *    `codingAgentsMeanCostUsd`) — stable and easy to read;
 *  - the image/video arenas ship their rows only inside the Next.js RSC stream.
 *
 * Rankings are the published order. `rank_delta` / `score_delta` are computed
 * against the previous fixture, matching the original's "relative to the last
 * snapshot" semantics.
 */
import { fetchText } from '../lib/http.mjs'

export const KIND_META = [
  {
    id: 'intelligence',
    labelKey: 'models.kinds.intelligence',
    higherIsBetter: true,
    unit: 'index',
    sourceUrl: 'https://artificialanalysis.ai/zh/models#intelligence',
    page: 'https://artificialanalysis.ai/zh/models',
    ldKey: 'artificialAnalysisIntelligenceIndex',
  },
  {
    id: 'coding_index',
    labelKey: 'models.kinds.coding_index',
    higherIsBetter: true,
    unit: 'ratio',
    sourceUrl: 'https://artificialanalysis.ai/zh/agents/coding-agents#coding-agents-index',
    page: 'https://artificialanalysis.ai/zh/agents/coding-agents',
    ldKey: 'codingAgentsIndex',
  },
  {
    id: 'coding_cost',
    labelKey: 'models.kinds.coding_cost',
    higherIsBetter: false,
    unit: 'usd',
    sourceUrl: 'https://artificialanalysis.ai/zh/agents/coding-agents#cost-to-run',
    page: 'https://artificialanalysis.ai/zh/agents/coding-agents',
    ldKey: 'codingAgentsMeanCostUsd',
  },
  {
    id: 'text_to_image',
    labelKey: 'models.kinds.text_to_image',
    higherIsBetter: true,
    unit: 'elo',
    sourceUrl: 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image',
    page: 'https://artificialanalysis.ai/zh/image/leaderboard/text-to-image',
    rsc: true,
  },
  {
    id: 'image_to_video',
    labelKey: 'models.kinds.image_to_video',
    higherIsBetter: true,
    unit: 'elo',
    sourceUrl: 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video',
    page: 'https://artificialanalysis.ai/zh/video/leaderboard/image-to-video',
    rsc: true,
  },
]

/** Reverses the escaping Next.js applies when embedding the RSC stream. */
function rscText(html) {
  // Each push argument is a JS string literal, which is also valid JSON, so let
  // JSON.parse do the unescaping. Chaining regex replacements here is order
  // dependent and corrupts sequences such as \\n.
  return [...html.matchAll(/self\.__next_f\.push\(\[1,([\s\S]*?)\)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1].trim().replace(/\]$/, ''))
      } catch {
        return ''
      }
    })
    .join('')
}

/** Reads a balanced JSON literal starting at `start` (which must be '[' or '{'). */
function extractBalanced(text, start) {
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .map((raw) => {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function flatten(doc) {
  return Array.isArray(doc) ? doc : [doc]
}

/** LLM boards: pull the Dataset whose rows carry the metric we want. */
function rowsFromJsonLd(html, ldKey) {
  for (const doc of jsonLdBlocks(html)) {
    for (const node of flatten(doc)) {
      const rows = node?.data
      if (!Array.isArray(rows) || !rows.length) continue
      if (!(ldKey in rows[0])) continue
      return rows.map((row) => ({
        // Coding boards append the developer on its own line, e.g.
        // "Codex - DeepSeek V4 Pro 0813 (max)\n(DeepSeek)".
        name: String(row.label ?? '').replace(/\s+/g, ' ').trim(),
        score: Number(row[ldKey]),
        slug: String(row.detailsUrl ?? '').split('/').filter(Boolean).pop() ?? '',
        org: '',
      }))
    }
  }
  throw new Error(`no JSON-LD dataset exposing "${ldKey}"`)
}

/**
 * Arena boards: the rows live in the RSC stream. The page also embeds one array
 * per sub-category, so only the first occurrence — the overall board rendered by
 * the leaderboard component — is used.
 */
function rowsFromRsc(html) {
  const text = rscText(html)
  const marker = '[{"formatted":{"rank":1,'
  let from = 0
  while (from < text.length) {
    const at = text.indexOf(marker, from)
    if (at < 0) break
    from = at + 1
    const raw = extractBalanced(text, at)
    if (!raw) continue
    let rows
    try {
      rows = JSON.parse(raw)
    } catch {
      continue
    }
    if (!Array.isArray(rows) || rows.length < 2) continue
    if (rows[0]?.formatted?.rank !== 1) continue
    return rows.map((row) => ({
      name: String(row.values.name).trim(),
      score: Number(row.values.elo),
      slug: '',
      org: String(row.values.creator?.name ?? '').trim(),
    }))
  }
  throw new Error('no RSC leaderboard rows found')
}

/**
 * Maps a model slug to its developer using the RSC payload, which pairs
 * `release.slug` with `creator.name`. Used for models the frozen map misses.
 */
function orgBySlug(html) {
  const text = rscText(html)
  const map = new Map()
  const re = /"release":\{"slug":"([^"]+)"[\s\S]{0,600}?"creator":\{[^}]*?"name":"([^"]+)"/g
  for (const m of text.matchAll(re)) map.set(m[1], m[2])
  const re2 = /"slug":"([^"]+)","name":"[^"]*"[\s\S]{0,400}?"creator":\{[^}]*?"name":"([^"]+)"/g
  for (const m of text.matchAll(re2)) if (!map.has(m[1])) map.set(m[1], m[2])
  return map
}

/**
 * Builds the lookup tables used to resolve a model's developer.
 *
 * The boards label developers inconsistently: the arenas expose a creator
 * object, the coding boards append a display name in parentheses
 * ("(Alibaba Cloud)", "(SpaceXAI)") that does not match the canonical org the UI
 * colours and logos are keyed on ("Alibaba", "xAI"). The previous fixture gives
 * us that display-name -> canonical-org mapping for free.
 */
export function buildOrgContext(previousModels) {
  const byName = new Map()
  const byDisplay = new Map()
  const byCore = new Map()

  for (const payload of Object.values(previousModels ?? {})) {
    for (const item of payload?.items ?? []) {
      if (!item?.org || item.org === 'Unknown') continue
      const name = String(item.model_name ?? '').replace(/\s+/g, ' ').trim()
      if (!name) continue
      byName.set(name, item.org)
      const core = name.replace(/\s*\([^()]*\)\s*$/, '').trim()
      if (core) byCore.set(core, item.org)
      const display = name.match(/\(([^()]+)\)\s*$/)
      if (display) byDisplay.set(display[1], item.org)
    }
  }
  return { byName, byDisplay, byCore }
}

function resolveOrg(row, context, slugOrg) {
  if (row.org) return row.org
  const name = row.name
  const display = name.match(/\(([^()]+)\)\s*$/)

  if (display && context.byDisplay.has(display[1])) return context.byDisplay.get(display[1])
  if (context.byName.has(name)) return context.byName.get(name)
  const core = name.replace(/\s*\([^()]*\)\s*$/, '').trim()
  if (context.byCore.has(core)) return context.byCore.get(core)
  if (display && display[1]) return display[1]
  if (row.slug && slugOrg.has(row.slug)) return slugOrg.get(row.slug)
  // Stay null rather than inventing "Unknown": the UI renders its own "—"
  // placeholder for a missing developer, and the original does the same.
  return null
}

async function collectKind(meta, previous, context) {
  const html = await fetchText(meta.page, { timeoutMs: 45000 })
  const rows = meta.rsc ? rowsFromRsc(html) : rowsFromJsonLd(html, meta.ldKey)
  const slugOrg = meta.rsc ? new Map() : orgBySlug(html)

  const previousByName = new Map(
    (previous?.items ?? []).map((item) => [String(item.model_name).replace(/\s+/g, ' ').trim(), item]),
  )
  const snapshotAt = new Date().toISOString()

  const items = rows
    .filter((row) => row.name && Number.isFinite(row.score))
    .map((row, index) => {
      const prev = previousByName.get(row.name)
      const org = resolveOrg(
        { ...row, org: row.org || prev?.org || '' },
        context,
        slugOrg,
      )
      const rank = index + 1
      const item = {
        source: 'artificial_analysis',
        leaderboard_kind: meta.id,
        rank,
        // Positive means the model moved up (matches the UI's ↑/↓ rendering).
        rank_delta: prev ? prev.rank - rank : 0,
        model_name: row.name,
        org,
        score: row.score,
        score_delta: prev && Number.isFinite(prev.score) ? row.score - prev.score : 0,
        snapshot_at: snapshotAt,
        source_url: row.slug ? `https://artificialanalysis.ai/zh/models/${row.slug}` : meta.sourceUrl,
      }
      // Flagged so the digest still has a model signal on runs where no rank
      // moved but a board gained entries.
      if (!prev) item.is_new = true
      return item
    })

  return {
    source: 'db',
    kind: meta.id,
    kindMeta: {
      id: meta.id,
      labelKey: meta.labelKey,
      higherIsBetter: meta.higherIsBetter,
      unit: meta.unit,
      sourceUrl: meta.sourceUrl,
    },
    kinds: KIND_META.map((k) => ({
      id: k.id,
      labelKey: k.labelKey,
      higherIsBetter: k.higherIsBetter,
      unit: k.unit,
      sourceUrl: k.sourceUrl,
      hasData: true,
    })),
    items,
  }
}

/**
 * Collects a single leaderboard.
 * @param {object} meta entry from KIND_META
 * @param {object|null} previous previous fixture for this kind
 * @param {object} context result of buildOrgContext
 */
export async function collectModelKind(meta, previous, context) {
  return collectKind(meta, previous, context ?? buildOrgContext({}))
}

/**
 * @param {Record<string, object>} previousByKind previous fixture per kind
 * @param {object} context result of buildOrgContext
 */
export async function collectModels(previousByKind, context) {
  const out = {}
  for (const meta of KIND_META) {
    out[meta.id] = await collectKind(meta, previousByKind[meta.id] ?? null, context ?? buildOrgContext({}))
  }
  return out
}
