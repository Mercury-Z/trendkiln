/**
 * Small RSS 2.0 / Atom / RDF parser — just enough for the feed sources.
 * Keeps a dependency out of the build and tolerates the usual real-world mess
 * (CDATA, HTML entities, self-closing tags, missing dates).
 */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

function decodeEntities(input) {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => ENTITIES[name] ?? match)
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
}

/** Extracts the text of the first matching tag inside `xml`. */
function tag(xml, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
    const m = xml.match(re)
    if (m) return decodeEntities(stripCdata(m[1])).trim()
  }
  return ''
}

/** Atom links carry the URL in an attribute rather than the body. */
function atomLink(entry) {
  const alternate = entry.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
  if (alternate) return decodeEntities(alternate[1])
  const anyHref = entry.match(/<link[^>]*href=["']([^"']+)["']/i)
  if (anyHref) return decodeEntities(anyHref[1])
  return tag(entry, ['link'])
}

function textOnly(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @returns {{title:string,url:string,summary:string,publishedAt:string|null,tags:string[]}[]}
 */
export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? []
  const items = []

  for (const block of blocks) {
    const title = textOnly(tag(block, ['title']))
    const isAtom = /^<entry/i.test(block)
    const url = isAtom ? atomLink(block) : tag(block, ['link', 'guid'])
    const rawSummary = tag(block, ['description', 'summary', 'content:encoded', 'content'])
    const summary = textOnly(rawSummary)
    const dateRaw =
      tag(block, ['pubDate', 'published', 'updated', 'dc:date', 'date']) || ''
    const parsed = dateRaw ? new Date(dateRaw) : null
    const tags = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map((m) => textOnly(decodeEntities(stripCdata(m[1]))))
      .filter(Boolean)

    if (!title || !url) continue
    items.push({
      title,
      url,
      summary,
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      tags: tags.slice(0, 4),
    })
  }
  return items
}
