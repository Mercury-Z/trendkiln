import { computed, ref } from 'vue'
import { addWatch as storeAdd, getWatchlist, removeWatch as storeRemove } from './useDemoStore'

/** Watchlist access. Kept API-compatible with the original's useWatchlist(). */
export function useWatchlist() {
  const version = ref(0)

  const items = computed(() => {
    void version.value
    return getWatchlist().items
  })
  const source = computed(() => getWatchlist().source)
  const pending = ref(false)
  const error = ref<unknown>(null)

  const index = computed(() => {
    const set = new Set<string>()
    for (const item of items.value) set.add(`${item.target_type}:${item.target_key}`)
    return set
  })

  function isWatched(targetType: string, targetKey: string) {
    void version.value
    return index.value.has(`${targetType}:${targetKey}`)
  }

  async function addWatch(targetType: string, targetKey: string, note?: string | null) {
    storeAdd(targetType, targetKey, note ?? null)
    version.value++
  }

  async function removeWatch(target: { id?: string; target_type?: string; target_key?: string }) {
    storeRemove(target)
    version.value++
  }

  async function toggleWatch(targetType: string, targetKey: string) {
    if (isWatched(targetType, targetKey)) await removeWatch({ target_type: targetType, target_key: targetKey })
    else await addWatch(targetType, targetKey)
  }

  async function refresh() {
    version.value++
  }

  return { items, source, pending, error, refresh, isWatched, addWatch, removeWatch, toggleWatch }
}
