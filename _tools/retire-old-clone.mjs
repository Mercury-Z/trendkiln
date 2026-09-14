/**
 * Retires the older, lower-fidelity `trendkiln-clone` Pages deployment by
 * turning it into a redirect to the faithful replica.
 *
 * What it does
 *  1. preserves the current main tip on a `legacy` branch (nothing is lost);
 *  2. replaces main with a static redirect site that maps every old section
 *     path (/github/, /models/, /feed/, /watchlist/, /settings/) to the same
 *     page on the new site, with a path-aware 404 fallback;
 *  3. drops the old daily `update.yml` workflow so it cannot keep committing.
 *
 * Usage: node _tools/retire-old-clone.mjs [target]
 *   target defaults to https://mercury-z.github.io/trendkiln/
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TARGET = (process.argv[2] || 'https://mercury-z.github.io/trendkiln/').replace(/\/?$/, '/')
const REPO = 'Mercury-Z/trendkiln-clone'
const SECTIONS = ['github', 'models', 'feed', 'watchlist', 'settings']

const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', ...opts })

/* ---------- 1. safety net: keep the old tip on a `legacy` branch ---------- */
const headSha = JSON.parse(gh(['api', `repos/${REPO}/git/ref/heads/main`])).object.sha
let legacyExists = false
try {
  JSON.parse(gh(['api', `repos/${REPO}/git/ref/heads/legacy`]))
  legacyExists = true
} catch {
  legacyExists = false
}

if (legacyExists) {
  console.log(`legacy branch already exists — leaving it untouched`)
} else {
  gh([
    'api',
    '-X',
    'POST',
    `repos/${REPO}/git/refs`,
    '-f',
    'ref=refs/heads/legacy',
    '-f',
    `sha=${headSha}`,
  ])
  console.log(`preserved main@${headSha.slice(0, 7)} on branch 'legacy'`)
}

/* ---------- 2. build the redirect site ---------- */
function redirectPage(to, label) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>已迁移 · Trendkiln</title>
<link rel="canonical" href="${to}">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)} + location.hash);</script>
<style>
  :root { color-scheme: dark }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background-color: #09090b; color: #f4f4f5;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background-image: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139,92,246,.12), transparent);
  }
  main { text-align: center; padding: 2rem }
  p { color: #a1a1aa; font-size: .875rem; line-height: 1.7 }
  a { color: #c4b5fd }
</style>
</head>
<body>
<main>
  <p>${label}</p>
  <p>已迁移至 <a href="${to}">${to}</a></p>
</main>
</body>
</html>
`
}

/** 404 fallback: map any old deep link onto the matching page of the new site. */
const notFound = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>已迁移 · Trendkiln</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${TARGET}">
<script>
(function () {
  var TARGET = ${JSON.stringify(TARGET)};
  var SECTIONS = ${JSON.stringify(SECTIONS)};
  var seg = location.pathname.replace(/^\\/+/, '').split('/')[0];
  location.replace(SECTIONS.indexOf(seg) >= 0 ? TARGET + seg : TARGET);
})();
</script>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #09090b; color: #a1a1aa; font-family: system-ui, sans-serif; font-size: .875rem }
  a { color: #c4b5fd }
</style>
</head>
<body>
<main>已迁移至 <a href="${TARGET}">${TARGET}</a></main>
</body>
</html>
`

/* ---------- 3. rewrite the repo in a temp clone ---------- */
const work = mkdtempSync(join(tmpdir(), 'tk-retire-'))
const run = (args) => execFileSync('git', args, { cwd: work, stdio: 'inherit' })

console.log('cloning…')
execFileSync('git', ['clone', '--depth', '1', `https://github.com/${REPO}.git`, work], { stdio: 'inherit' })

// keep the licence text if the old repo had one
const license = existsSync(join(work, 'LICENSE')) ? readFileSync(join(work, 'LICENSE'), 'utf8') : null

for (const entry of readdirSync(work)) {
  if (entry === '.git') continue
  rmSync(join(work, entry), { recursive: true, force: true })
}

writeFileSync(join(work, '.nojekyll'), '')
writeFileSync(
  join(work, 'index.html'),
  redirectPage(TARGET, 'Trendkiln 已迁移到新的复刻版本。'),
)
for (const section of SECTIONS) {
  mkdirSync(join(work, section), { recursive: true })
  writeFileSync(join(work, section, 'index.html'), redirectPage(`${TARGET}${section}`, `Trendkiln · ${section} 已迁移。`))
}
writeFileSync(join(work, '404.html'), notFound)
writeFileSync(join(work, 'robots.txt'), 'User-agent: *\nDisallow:\n')
if (license) writeFileSync(join(work, 'LICENSE'), license)

writeFileSync(
  join(work, 'README.md'),
  `# trendkiln-clone (已归档为跳转)

这个仓库原本是本项目的早期静态实现。它已经被还原度更高的复刻版本取代：

**新地址：<${TARGET}>**

仓库现在只保留一个静态跳转页：\`/\`、\`/github/\`、\`/models/\`、\`/feed/\`、
\`/watchlist/\`、\`/settings/\` 会分别跳转到新站点对应页面，\`404.html\`
会把其余深层链接映射到最接近的页面。

旧的实现代码、数据采集脚本与其历史仍然完整保存在 [\`legacy\`](../../tree/legacy) 分支上。

## 为什么迁移

早期版本是手写的原生 JS 静态站，自有 CSS 与客户端渲染，与原站的 DOM 结构、
设计系统都不一致。新版本按原站技术栈（Nuxt 3 + Tailwind + i18n）重写，
并逐路由校验了服务端渲染 DOM 的一致性。
`,
)

run(['config', 'user.name', 'Mercury-Z'])
run(['config', 'user.email', '43981124+Mercury-Z@users.noreply.github.com'])
run(['add', '-A'])
run([
  'commit',
  '-m',
  `chore: replace clone with a redirect to the faithful replica

The older hand-rolled static implementation is superseded by
${TARGET}

This commit keeps a path-aware redirect for every old section URL, drops the
daily update.yml workflow, and preserves the previous tip on the 'legacy'
branch.`,
])
run(['push', 'origin', 'main'])

rmSync(work, { recursive: true, force: true })

/* ---------- 4. point repo metadata at the new site ---------- */
gh(['api', '-X', 'PATCH', `repos/${REPO}`, '-f', `homepage=${TARGET}`])
gh([
  'api',
  '-X',
  'PATCH',
  `repos/${REPO}`,
  '-f',
  'description=已迁移 -> Trendkiln 复刻版（新版：mercury-z.github.io/trendkiln）',
])
console.log('done.')
