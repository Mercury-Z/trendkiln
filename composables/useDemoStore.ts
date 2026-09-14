import { reactive, readonly } from 'vue'
import {
  deriveSignals,
  queryDigest,
  queryFeed,
  queryGithub,
  queryModels,
  queryWatchlist,
  type DigestItem,
  type FeedItem,
  type FeedPayload,
  type GithubPayload,
  type ModelsPayload,
  type WatchlistItem,
  type WatchlistPayload,
} from '~/demo/db'

const LS_ITEM_STATE = 'ai-radar:item-state'
const LS_WATCHLIST = 'ai-radar:watchlist'

interface ItemState {
  read?: boolean
  saved?: boolean
}

interface Overlay {
  itemState: Record<string, ItemState>
  watchAdded: WatchlistItem[]
  watchRemoved: string[]
  hydrated: boolean
}

/**
 * Module-level singleton. It stays empty during SSR (so the server-rendered
 * markup is byte-for-byte the pristine dataset) and is filled from
 * localStorage on mount, exactly like the original's client-side preferences.
 */
const overlay = reactive<Overlay>({
  itemState: {},
  watchAdded: [],
  watchRemoved: [],
  hydrated: false,
})

function key(type: string, id: string | number) {
  return `${type}:${id}`
}

function persist() {
  if (import.meta.server) return
  try {
    localStorage.setItem(LS_ITEM_STATE, JSON.stringify(overlay.itemState))
    localStorage.setItem(
      LS_WATCHLIST,
      JSON.stringify({ added: overlay.watchAdded, removed: overlay.watchRemoved }),
    )
  } catch {
    /* storage unavailable — degrade to in-memory */
  }
}

export function hydrateDemoOverlay() {
  if (import.meta.server || overlay.hydrated) return
  overlay.hydrated = true
  try {
    const raw = localStorage.getItem(LS_ITEM_STATE)
    if (raw) Object.assign(overlay.itemState, JSON.parse(raw))
  } catch {
    /* ignore malformed storage */
  }
  try {
    const raw = localStorage.getItem(LS_WATCHLIST)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.added)) overlay.watchAdded = parsed.added
      if (Array.isArray(parsed?.removed)) overlay.watchRemoved = parsed.removed
    }
  } catch {
    /* ignore malformed storage */
  }
}

/* ------------------------------------------------------------------ *
 * Item state (read / saved) — the original POSTs to /api/item-state.
 * ------------------------------------------------------------------ */
export function setItemState(itemType: string, itemId: string | number, patch: ItemState) {
  const k = key(itemType, itemId)
  overlay.itemState[k] = { ...(overlay.itemState[k] ?? {}), ...patch }
  persist()
}

export function getItemState(itemType: string, itemId: string | number): ItemState {
  return overlay.itemState[key(itemType, itemId)] ?? {}
}

function applyFeedState(item: FeedItem): FeedItem {
  const st = overlay.itemState[key('feed', item.id)]
  if (!st || (st.read === undefined && st.saved === undefined)) return item
  const read_at = st.read === undefined ? item.read_at : st.read ? item.read_at || new Date().toISOString() : null
  const saved = st.saved === undefined ? item.saved : st.saved
  return { ...item, read_at, saved }
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */
export function getDigest(limit: number): {
  source: string
  digest_date: string
  headline: string
  items: DigestItem[]
} {
  return queryDigest(limit)
}

export function getGithub(window: string): GithubPayload {
  return queryGithub(window)
}

export function getModels(kind: string, limit = 40): ModelsPayload {
  return queryModels(kind, limit)
}

export function getFeed(filter: string): FeedPayload {
  const base = queryFeed(filter === 'all' ? 'all' : 'all')
  const items = base.items.map(applyFeedState)
  const filtered = items.filter((item) => {
    if (filter === 'unread') return !item.read_at
    if (filter === 'saved') return !!item.saved
    return true
  })
  return { source: base.source, items: filtered }
}

export function getWatchlist(): WatchlistPayload {
  const base = queryWatchlist()
  const removed = new Set(overlay.watchRemoved)
  const items = [...base.items, ...overlay.watchAdded]
    .filter((item) => !removed.has(item.id))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  return { source: base.source, items }
}

export function addWatch(targetType: string, targetKey: string, note: string | null = null) {
  const existing = getWatchlist().items.find(
    (i) => i.target_type === targetType && i.target_key === targetKey,
  )
  if (existing) return existing
  const now = new Date().toISOString()
  const highest = Math.max(0, ...getWatchlist().items.map((i) => Number(i.id) || 0))
  const item: WatchlistItem = {
    id: String(highest + 1),
    target_type: targetType,
    target_key: targetKey,
    note,
    created_at: now,
    last_signal_at: now,
    signals: deriveSignals(targetType, targetKey),
  }
  overlay.watchAdded.push(item)
  overlay.watchRemoved = overlay.watchRemoved.filter((id) => id !== item.id)
  persist()
  return item
}

export function removeWatch(target: { id?: string; target_type?: string; target_key?: string }) {
  const items = getWatchlist().items
  const target_ = target.id
    ? items.find((i) => i.id === target.id)
    : items.find((i) => i.target_type === target.target_type && i.target_key === target.target_key)
  if (!target_) return
  overlay.watchAdded = overlay.watchAdded.filter((i) => i.id !== target_.id)
  if (!overlay.watchRemoved.includes(target_.id)) overlay.watchRemoved.push(target_.id)
  persist()
}

export function useDemoStore() {
  return {
    overlay: readonly(overlay) as Readonly<Overlay>,
    hydrate: hydrateDemoOverlay,
    setItemState,
    getItemState,
    getDigest,
    getGithub,
    getModels,
    getFeed,
    getWatchlist,
    addWatch,
    removeWatch,
  }
}
