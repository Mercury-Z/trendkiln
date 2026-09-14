/**
 * Publishes the generated static site to the `gh-pages` branch of this repo.
 *
 * The artifact is committed from a throwaway repository in the OS temp dir, so
 * the working tree (and its node_modules) is never touched.
 *
 * Usage:
 *   node _tools/deploy-gh-pages.mjs [basePath] [remote]
 *   node _tools/deploy-gh-pages.mjs /trendkiln/ origin
 *
 * Requires: a prior `NUXT_APP_BASE_URL=<basePath> npm run generate`, git, and
 * push credentials for the remote (the `gh` CLI credential helper works).
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = process.argv[2] || '/'
const REMOTE = process.argv[3] || 'origin'
const PROJECT = resolve(import.meta.dirname, '..')
const ARTIFACT = join(PROJECT, '.output', 'public')
const BRANCH = 'gh-pages'

if (!existsSync(join(ARTIFACT, 'index.html'))) {
  console.error(`No artifact at ${ARTIFACT}. Run \`npm run generate\` first.`)
  process.exit(1)
}

// Guard against publishing a build whose base path does not match.
const indexHtml = readFileSync(join(ARTIFACT, 'index.html'), 'utf8')
const expectedPrefix = BASE === '/' ? '/' : BASE
if (!indexHtml.includes(`"${expectedPrefix}_nuxt/`)) {
  console.error(
    `Artifact does not look like it was built with baseURL "${BASE}".\n` +
      `Re-run: NUXT_APP_BASE_URL=${BASE} npm run generate`,
  )
  process.exit(1)
}

const remoteUrl = (() => {
  // In Actions the checkout action authenticates through a git config header,
  // which a throwaway repo in the temp dir does not inherit — so build an
  // authenticated URL from the job token instead.
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    return `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`
  }
  return execFileSync('git', ['remote', 'get-url', REMOTE], { cwd: PROJECT, encoding: 'utf8' }).trim()
})()

const work = join(tmpdir(), `tk-ghpages-${Date.now()}`)
mkdirSync(work, { recursive: true })

const run = (args, opts = {}) => execFileSync('git', args, { cwd: work, stdio: 'inherit', ...opts })

console.log(`publishing ${ARTIFACT} -> ${remoteUrl} (${BRANCH})`)
cpSync(ARTIFACT, work, { recursive: true })
// GitHub Pages must not run Jekyll over the artifact.
writeFileSync(join(work, '.nojekyll'), '')

run(['init', '-b', BRANCH])
run(['config', 'user.name', 'github-actions[bot]'])
run(['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'])
run(['add', '-A'])
run(['commit', '-m', `chore: publish static build (base ${BASE})`])
run(['remote', 'add', 'origin', remoteUrl])
run(['push', '-f', 'origin', BRANCH])

rmSync(work, { recursive: true, force: true })
console.log('done.')
