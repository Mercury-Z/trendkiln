/**
 * Minimal fetch helpers for the collector.
 *
 * Upstreams here are public pages and feeds, so requests are deliberately
 * polite: one identifying UA, bounded retries with backoff, and a timeout.
 */
const UA =
  'TrendkilnBot/1.0 (+https://github.com/Mercury-Z/trendkiln; static fan-out of public leaderboards)'

export const USER_AGENT = UA

export async function fetchText(url, { headers = {}, retries = 3, timeoutMs = 30000 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', ...headers },
        signal: controller.signal,
        redirect: 'follow',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (error) {
      lastError = error
      if (attempt < retries) await sleep(600 * attempt)
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`fetch failed after ${retries} attempts: ${url} (${lastError?.message})`)
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    headers: { accept: 'application/vnd.github+json', ...(options.headers || {}) },
  })
  return JSON.parse(text)
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Runs `worker` over `items` with a bounded number of concurrent requests. */
export async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = await worker(items[index], index)
      } catch (error) {
        results[index] = { __error: error.message }
      }
    }
  })
  await Promise.all(runners)
  return results
}
