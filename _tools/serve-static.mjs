/**
 * Minimal static file server that mimics GitHub Pages semantics well enough to
 * validate the generated artifact locally: directory indexes, extension-less
 * fallbacks and the custom 404.html.
 *
 * Usage: node _tools/serve-static.mjs [port] [rootDir] [basePath]
 *   basePath defaults to "/" — pass e.g. /trendkiln/ to emulate a project page.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const PORT = Number(process.argv[2] || 4173)
const ROOT = process.argv[3] || 'E:/复刻钟政ds41f/trendkiln/.output/public'
const BASE = process.argv[4] || '/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

async function tryFile(path) {
  try {
    const info = await stat(path)
    if (info.isFile()) return path
    if (info.isDirectory()) {
      const index = join(path, 'index.html')
      const idx = await stat(index)
      if (idx.isFile()) return index
    }
  } catch {
    /* miss */
  }
  return null
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)

  if (BASE !== '/') {
    if (pathname === BASE.replace(/\/$/, '')) {
      res.writeHead(302, { location: BASE }).end()
      return
    }
    if (!pathname.startsWith(BASE)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Outside base path')
      return
    }
    pathname = '/' + pathname.slice(BASE.length)
  }

  const resolved = normalize(join(ROOT, pathname))
  if (!resolved.startsWith(normalize(ROOT))) {
    res.writeHead(403).end('Forbidden')
    return
  }

  let file = await tryFile(resolved)
  if (!file && !extname(pathname)) file = await tryFile(join(ROOT, '404.html'))

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
    return
  }

  const body = await readFile(file)
  const is404 = file.endsWith('404.html') && pathname !== '/404.html'
  res.writeHead(is404 ? 404 : 200, {
    'content-type': MIME[extname(file)] || 'application/octet-stream',
    'content-length': body.length,
  })
  res.end(body)
}).listen(PORT, () => {
  console.log(`static server on http://localhost:${PORT}  root=${ROOT}`)
})
