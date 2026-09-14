/**
 * Digest builder.
 *
 * The original's ranking function is not observable, so this rebuilds the same
 * item shape from the same three signals (repo surges, leaderboard moves, new
 * posts) and interleaves them so the digest stays a mix rather than one bucket.
 */

const MAX_ITEMS = 20

/** Type rotation used to interleave the three candidate pools. */
const PATTERN = ['github_surge', 'model_rank_change', 'feed_must_read', 'model_rank_change', 'github_surge']

function localized(text) {
  return { zh: text, en: text }
}

function githubCandidates(daily) {
  return (daily?.items ?? [])
    .filter((item) => item.stars_delta > 0)
    .slice()
    .sort((a, b) => b.stars_delta - a.stars_delta)
    .map((item) => {
      const titleZh = `${item.full_name} 星标异动`
      const titleEn = `${item.full_name} star surge`
      const subtitle = item.description || item.full_name
      const signalZh = `+${item.stars_delta.toLocaleString('en-US')} 星标`
      const signalEn = `+${item.stars_delta.toLocaleString('en-US')} stars`
      return {
        type: 'github_surge',
        title: { zh: titleZh, en: titleEn },
        subtitle: localized(subtitle),
        signal: { zh: signalZh, en: signalEn },
        title_zh: titleZh,
        title_en: titleEn,
        subtitle_zh: subtitle,
        subtitle_en: subtitle,
        signal_zh: signalZh,
        signal_en: signalEn,
        source: 'GitHub Trending',
        url: item.html_url,
        occurred_at: item.snapshot_at,
        entity_id: `repo:${item.full_name}`,
      }
    })
}

function modelCandidates(modelsByKind) {
  const out = []
  for (const [kind, payload] of Object.entries(modelsByKind)) {
    for (const item of payload?.items ?? []) {
      // A model that is new to the board is a signal in its own right, and keeps
      // the digest varied on runs where no existing rank moved.
      if (!item.rank_delta && !item.is_new) continue
      const isNew = !item.rank_delta && item.is_new
      const up = item.rank_delta > 0
      const magnitude = Math.abs(item.rank_delta)
      const titleZh = `${item.model_name} 排名变化`
      const titleEn = `${item.model_name} rank change`
      const subtitle = item.org ? `#${item.rank} · ${item.org}` : `#${item.rank}`
      const signalZh = isNew ? '新上榜' : `排名 ${up ? '↑' : '↓'}${magnitude}`
      const signalEn = isNew ? 'new entry' : `rank ${up ? '↑' : '↓'}${magnitude}`
      out.push({
        type: 'model_rank_change',
        title: { zh: titleZh, en: titleEn },
        subtitle: localized(subtitle),
        signal: { zh: signalZh, en: signalEn },
        title_zh: titleZh,
        title_en: titleEn,
        subtitle_zh: subtitle,
        subtitle_en: subtitle,
        signal_zh: signalZh,
        signal_en: signalEn,
        source: 'Artificial Analysis',
        url: payload.kindMeta?.sourceUrl ?? 'https://artificialanalysis.ai/zh/models',
        occurred_at: item.snapshot_at,
        entity_id: `model:${item.model_name}`,
        _weight: isNew ? magnitude + 1 : magnitude,
        _kind: kind,
      })
    }
  }
  // Biggest movers first; ties broken by board order for determinism.
  return out.sort((a, b) => b._weight - a._weight).map(({ _weight, _kind, ...item }) => item)
}

function feedCandidates(feed) {
  return (feed?.items ?? []).slice(0, 40).map((item) => {
    const title = item.title?.zh ?? item.title_text ?? ''
    const subtitle = item.summary?.zh ?? item.summary_text ?? ''
    return {
      type: 'feed_must_read',
      title: localized(title),
      subtitle: localized(subtitle),
      signal: { zh: '资讯', en: 'feed' },
      title_zh: title,
      title_en: item.title?.en ?? title,
      subtitle_zh: subtitle,
      subtitle_en: item.summary?.en ?? subtitle,
      signal_zh: '资讯',
      signal_en: 'feed',
      source: item.source_name,
      url: item.url,
      occurred_at: item.published_at,
      entity_id: `feed:${item.id}`,
    }
  })
}

/**
 * @param {object} daily github daily payload
 * @param {Record<string, object>} modelsByKind
 * @param {object} feed
 */
export function buildDigest(daily, modelsByKind, feed) {
  const pools = {
    github_surge: githubCandidates(daily),
    model_rank_change: modelCandidates(modelsByKind),
    feed_must_read: feedCandidates(feed),
  }

  const picked = []
  const seen = new Set()
  let round = 0
  while (picked.length < MAX_ITEMS && round < MAX_ITEMS * 3) {
    const type = PATTERN[round % PATTERN.length]
    const next = pools[type].shift()
    if (next && !seen.has(next.entity_id)) {
      seen.add(next.entity_id)
      picked.push(next)
    }
    round++
    if (!pools.github_surge.length && !pools.model_rank_change.length && !pools.feed_must_read.length) break
  }

  const now = new Date()
  return {
    source: 'db',
    digest_date: now.toISOString().slice(0, 10),
    headline: `Trendkiln · ${now.toISOString().slice(0, 10)}`,
    items: picked.map((item, index) => ({ id: String(index + 1), ...item })),
  }
}
