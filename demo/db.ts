/**
 * Demo dataset + query helpers.
 *
 * The original Trendkiln deployment serves this data from a database behind
 * Nitro (`source: "db"`). The clone ships the same payloads as static fixtures
 * so the site keeps working on free static hosting while `server/api/*` still
 * exposes the exact same HTTP contract.
 */
import digestFixture from './digest.json'
import githubDaily from './github-daily.json'
import githubWeekly from './github-weekly.json'
import githubMonthly from './github-monthly.json'
import modelsIntelligence from './models-intelligence.json'
import modelsCodingIndex from './models-coding_index.json'
import modelsCodingCost from './models-coding_cost.json'
import modelsTextToImage from './models-text_to_image.json'
import modelsImageToVideo from './models-image_to_video.json'
import feedFixture from './feed.json'
import watchlistFixture from './watchlist.json'

export type Locale = 'zh' | 'en'
export type LocalizedText = Partial<Record<Locale, string>> | string | null

export interface DigestItem {
  id: string
  type: string
  title: LocalizedText
  subtitle: LocalizedText
  signal: LocalizedText
  title_zh?: string
  title_en?: string
  subtitle_zh?: string
  subtitle_en?: string
  signal_zh?: string
  signal_en?: string
  source: string
  url: string
  occurred_at: string
  entity_id: string
}

export interface GithubItem {
  rank: number
  full_name: string
  description: string
  language: string
  topics: string[]
  stars: number
  stars_delta: number
  forks: number
  forks_delta: number
  html_url: string
  snapshot_at: string
  purpose: LocalizedText
  strengths: LocalizedText
  innovations: LocalizedText
  purpose_zh?: string
  purpose_en?: string
  strengths_zh?: string
  strengths_en?: string
  innovations_zh?: string
  innovations_en?: string
}

export interface GithubWindow {
  id: string
  hasData: boolean
}

export interface GithubPayload {
  source: string
  window: string
  windows: GithubWindow[]
  items: GithubItem[]
}

export interface ModelItem {
  source: string
  leaderboard_kind: string
  rank: number
  rank_delta: number
  model_name: string
  org: string
  score: number
  score_delta: number
  snapshot_at: string
  source_url: string
}

export interface ModelKind {
  id: string
  labelKey: string
  higherIsBetter: boolean
  unit: string
  sourceUrl: string
  hasData?: boolean
}

export interface ModelsPayload {
  source: string
  kind: string
  kindMeta: ModelKind
  kinds: ModelKind[]
  items: ModelItem[]
}

export interface FeedItem {
  id: string
  title: LocalizedText
  summary: LocalizedText
  title_zh?: string
  title_en?: string
  summary_zh?: string
  summary_en?: string
  title_text?: string
  summary_text?: string
  source_id: string
  source_name: string
  url: string
  published_at: string
  tags: string[]
  read_at?: string | null
  saved?: boolean
}

export interface FeedPayload {
  source: string
  items: FeedItem[]
}

export interface WatchlistItem {
  id: string
  target_type: string
  target_key: string
  note: string | null
  created_at: string
  last_signal_at: string | null
  signals: string[]
}

export interface WatchlistPayload {
  source: string
  items: WatchlistItem[]
}

export const GITHUB_WINDOWS = ['daily', 'weekly', 'monthly'] as const
export const MODEL_KINDS = [
  'intelligence',
  'coding_index',
  'coding_cost',
  'text_to_image',
  'image_to_video',
] as const

export const digestData = digestFixture as unknown as {
  source: string
  digest_date: string
  headline: string
  items: DigestItem[]
}

const githubData: Record<string, GithubPayload> = {
  daily: githubDaily as unknown as GithubPayload,
  weekly: githubWeekly as unknown as GithubPayload,
  monthly: githubMonthly as unknown as GithubPayload,
}

const modelsData: Record<string, ModelsPayload> = {
  intelligence: modelsIntelligence as unknown as ModelsPayload,
  coding_index: modelsCodingIndex as unknown as ModelsPayload,
  coding_cost: modelsCodingCost as unknown as ModelsPayload,
  text_to_image: modelsTextToImage as unknown as ModelsPayload,
  image_to_video: modelsImageToVideo as unknown as ModelsPayload,
}

export const feedData = feedFixture as unknown as FeedPayload
export const watchlistData = watchlistFixture as unknown as WatchlistPayload

/* ------------------------------------------------------------------ *
 * Pure query helpers — these mirror the behaviour of the original API.
 * ------------------------------------------------------------------ */

export function queryDigest(limit: number): {
  source: string
  digest_date: string
  headline: string
  items: DigestItem[]
} {
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : digestData.items.length
  return {
    source: digestData.source,
    digest_date: digestData.digest_date,
    headline: digestData.headline,
    items: digestData.items.slice(0, n),
  }
}

export function queryGithub(window: string): GithubPayload {
  return githubData[window] ?? githubData.daily
}

export function queryModels(kind: string, limit = 40): ModelsPayload {
  const base = modelsData[kind] ?? modelsData.intelligence
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : base.items.length
  return { ...base, items: base.items.slice(0, n) }
}

export function queryFeed(filter: string): FeedPayload {
  const items = feedData.items.filter((item) => {
    if (filter === 'unread') return !item.read_at
    if (filter === 'saved') return !!item.saved
    return true
  })
  return { source: feedData.source, items }
}

export function queryWatchlist(): WatchlistPayload {
  return { source: watchlistData.source, items: [...watchlistData.items] }
}

/** All-known targets, used to derive "recent signals" for a watchlist entry. */
export function deriveSignals(targetType: string, targetKey: string): string[] {
  const key = targetKey.toLowerCase()
  const out: string[] = []

  if (targetType === 'repo') {
    for (const window of GITHUB_WINDOWS) {
      const hit = githubData[window]?.items.find((i) => i.full_name.toLowerCase() === key)
      if (hit) {
        out.push(`+${hit.stars_delta.toLocaleString()} stars`, `#${hit.rank}`)
        break
      }
    }
  } else if (targetType === 'model') {
    for (const kind of MODEL_KINDS) {
      const hit = modelsData[kind]?.items.find((i) => i.model_name.toLowerCase() === key)
      if (hit) {
        out.push(`#${hit.rank}`, kind)
        break
      }
    }
  } else {
    for (const item of feedData.items) {
      const text = `${item.title_zh ?? ''} ${item.title_en ?? ''} ${item.title_text ?? ''}`
      if (text.toLowerCase().includes(key)) {
        out.push((item.title_zh ?? item.title_en ?? item.title_text ?? '').trim())
        if (out.length >= 3) break
      }
    }
    if (!out.length) {
      for (const window of GITHUB_WINDOWS) {
        const hit = githubData[window]?.items.find((i) => i.full_name.toLowerCase().includes(key))
        if (hit) {
          out.push(hit.full_name)
          break
        }
      }
    }
  }
  return out
}
