import { onMounted, ref } from 'vue'

const LS_KEY = 'ai-radar:digest-count'
const DEFAULT_DIGEST_COUNT = 5

const digestCount = ref(DEFAULT_DIGEST_COUNT)
let loaded = false

/** Home digest size. Persisted per-device in localStorage, like the original. */
export function usePrefs() {
  onMounted(() => {
    if (loaded) return
    loaded = true
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const n = Number(raw)
        if (Number.isFinite(n) && n >= 1 && n <= 20) digestCount.value = Math.floor(n)
      }
    } catch {
      /* ignore */
    }
  })

  function setDigestCount(value: number) {
    const n = Math.min(20, Math.max(1, Math.floor(value) || DEFAULT_DIGEST_COUNT))
    digestCount.value = n
    if (import.meta.client) {
      try {
        localStorage.setItem(LS_KEY, String(n))
      } catch {
        /* ignore */
      }
    }
  }

  return { digestCount, setDigestCount, DEFAULT_DIGEST_COUNT }
}
