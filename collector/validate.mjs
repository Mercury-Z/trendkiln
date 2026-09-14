/**
 * Fixture contract validator.
 *
 * The site renders whatever is in demo/*.json, so a malformed collector run
 * would ship a broken page. This asserts the shape the UI depends on and is run
 * both locally and in CI (see .github/workflows/update.yml).
 *
 * Usage: node collector/validate.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { KIND_META } from './sources/models.mjs'

const DEMO = join(resolve(import.meta.dirname, '..'), 'demo')
const GITHUB_WINDOWS = ['daily', 'weekly', 'monthly']

const problems = []
const notes = []

function load(name) {
  const path = join(DEMO, name)
  if (!existsSync(path)) {
    problems.push(`${name}: missing`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    problems.push(`${name}: invalid JSON (${error.message})`)
    return null
  }
}

function expect(condition, message) {
  if (!condition) problems.push(message)
}

function isLocalized(value) {
  return value && typeof value === 'object' && typeof value.zh === 'string' && typeof value.en === 'string'
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/* ---------------- github ---------------- */
for (const window of GITHUB_WINDOWS) {
  const file = `github-${window}.json`
  const doc = load(file)
  if (!doc) continue
  expect(doc.source === 'db', `${file}: source must be "db"`)
  expect(doc.window === window, `${file}: window must be "${window}"`)
  expect(Array.isArray(doc.windows) && doc.windows.length === 3, `${file}: windows must list 3 entries`)
  expect(Array.isArray(doc.items) && doc.items.length > 0, `${file}: items must be a non-empty array`)

  doc.items?.forEach((item, i) => {
    const at = `${file}[${i}]`
    expect(item.rank === i + 1, `${at}: rank must be sequential (got ${item.rank})`)
    expect(nonEmptyString(item.full_name), `${at}: full_name required`)
    expect(Number.isFinite(item.stars) && item.stars >= 0, `${at}: stars must be a number`)
    expect(Number.isFinite(item.stars_delta) && item.stars_delta >= 0, `${at}: stars_delta must be >= 0`)
    expect(Number.isFinite(item.forks) && item.forks >= 0, `${at}: forks must be a number`)
    expect(Array.isArray(item.topics), `${at}: topics must be an array`)
    expect(isLocalized(item.purpose), `${at}: purpose must be {zh,en}`)
    expect(isLocalized(item.strengths), `${at}: strengths must be {zh,en}`)
    expect(isLocalized(item.innovations), `${at}: innovations must be {zh,en}`)
    expect(nonEmptyString(item.insights_source), `${at}: insights_source required`)
    expect(/^https:\/\/github\.com\//.test(item.html_url ?? ''), `${at}: html_url must be a github url`)
    expect(!Number.isNaN(Date.parse(item.snapshot_at)), `${at}: snapshot_at must be a date`)
  })

  const sources = new Set(doc.items?.map((i) => i.insights_source))
  notes.push(`${file}: ${doc.items?.length ?? 0} repos, insights_source=${[...sources].join('/')}`)
}

/* ---------------- models ---------------- */
const orgCounts = new Map()
let missingOrg = 0
for (const meta of KIND_META) {
  const file = `models-${meta.id}.json`
  const doc = load(file)
  if (!doc) continue
  expect(doc.kind === meta.id, `${file}: kind must be "${meta.id}"`)
  expect(doc.kindMeta?.unit === meta.unit, `${file}: kindMeta.unit must be "${meta.unit}"`)
  expect(doc.kindMeta?.higherIsBetter === meta.higherIsBetter, `${file}: kindMeta.higherIsBetter mismatch`)
  expect(Array.isArray(doc.kinds) && doc.kinds.length === 5, `${file}: kinds must list 5 entries`)
  expect(Array.isArray(doc.items) && doc.items.length > 0, `${file}: items must be a non-empty array`)

  doc.items?.forEach((item, i) => {
    const at = `${file}[${i}]`
    expect(item.rank === i + 1, `${at}: rank must be sequential (got ${item.rank})`)
    expect(nonEmptyString(item.model_name), `${at}: model_name required`)
    // A missing developer is legitimate — upstream sometimes omits it and the
    // UI renders its own "—" placeholder.
    expect(item.org === null || item.org === undefined || nonEmptyString(item.org), `${at}: org must be a string or null`)
    expect(Number.isFinite(item.score), `${at}: score must be a number`)
    expect(Number.isFinite(item.rank_delta), `${at}: rank_delta must be a number`)
    expect(item.is_new === undefined || item.is_new === true, `${at}: is_new, when present, must be true`)
    expect(item.leaderboard_kind === meta.id, `${at}: leaderboard_kind mismatch`)
    if (nonEmptyString(item.org)) orgCounts.set(item.org, (orgCounts.get(item.org) ?? 0) + 1)
    if (item.org === null || item.org === undefined) missingOrg++
  })

  notes.push(`${file}: ${doc.items?.length ?? 0} rows`)
}

if (missingOrg) notes.push(`models: ${missingOrg} row(s) have no developer (rendered as "—")`)

/* ---------------- feed ---------------- */
const feed = load('feed.json')
if (feed) {
  expect(Array.isArray(feed.items) && feed.items.length > 0, 'feed.json: items must be a non-empty array')
  feed.items?.forEach((item, i) => {
    const at = `feed.json[${i}]`
    expect(nonEmptyString(item.id), `${at}: id required`)
    expect(nonEmptyString(item.url), `${at}: url required`)
    expect(isLocalized(item.title), `${at}: title must be {zh,en}`)
    expect(isLocalized(item.summary), `${at}: summary must be {zh,en}`)
    expect(nonEmptyString(item.source_name), `${at}: source_name required`)
    expect(!Number.isNaN(Date.parse(item.published_at)), `${at}: published_at must be a date`)
    expect(item.saved === true || item.saved === false, `${at}: saved must be boolean`)
  })
  const urls = feed.items.map((i) => i.url)
  expect(new Set(urls).size === urls.length, 'feed.json: urls must be unique')
  const ids = feed.items.map((i) => i.id)
  expect(new Set(ids).size === ids.length, 'feed.json: ids must be unique')
  notes.push(`feed.json: ${feed.items.length} items from ${new Set(feed.items.map((i) => i.source_name)).size} sources`)
}

/* ---------------- digest ---------------- */
const digest = load('digest.json')
if (digest) {
  expect(/^\d{4}-\d{2}-\d{2}$/.test(digest.digest_date ?? ''), 'digest.json: digest_date must be YYYY-MM-DD')
  expect(Array.isArray(digest.items) && digest.items.length > 0, 'digest.json: items must be a non-empty array')
  const types = new Set()
  digest.items?.forEach((item, i) => {
    const at = `digest.json[${i}]`
    types.add(item.type)
    expect(nonEmptyString(item.id), `${at}: id required`)
    expect(isLocalized(item.title), `${at}: title must be {zh,en}`)
    expect(isLocalized(item.subtitle), `${at}: subtitle must be {zh,en}`)
    expect(isLocalized(item.signal), `${at}: signal must be {zh,en}`)
    expect(nonEmptyString(item.source), `${at}: source required`)
    expect(nonEmptyString(item.url), `${at}: url required`)
    expect(nonEmptyString(item.entity_id), `${at}: entity_id required`)
  })
  expect(types.size >= 2, `digest.json: expected a mix of item types, got ${[...types].join(',')}`)
  const ids = digest.items.map((i) => i.id)
  expect(new Set(ids).size === ids.length, 'digest.json: ids must be unique')
  notes.push(`digest.json: ${digest.items.length} items (${[...types].join(', ')})`)
}

/* ---------------- watchlist ---------------- */
const watchlist = load('watchlist.json')
if (watchlist) {
  expect(Array.isArray(watchlist.items), 'watchlist.json: items must be an array')
  watchlist.items?.forEach((item, i) => {
    const at = `watchlist.json[${i}]`
    expect(nonEmptyString(item.target_type), `${at}: target_type required`)
    expect(nonEmptyString(item.target_key), `${at}: target_key required`)
    expect(Array.isArray(item.signals), `${at}: signals must be an array`)
  })
  notes.push(`watchlist.json: ${watchlist.items?.length ?? 0} entries`)
}

/* ---------------- report ---------------- */
console.log('Fixture summary')
for (const note of notes) console.log(`  ${note}`)

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems.slice(0, 40)) console.error(`  ✗ ${problem}`)
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`)
  process.exit(1)
}
console.log('\nAll fixtures satisfy the contract.')
