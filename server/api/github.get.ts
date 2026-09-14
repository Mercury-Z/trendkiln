import { queryGithub } from '~/demo/db'

export default defineEventHandler((event) => {
  const raw = String(getQuery(event).window ?? 'daily').toLowerCase()
  const window = raw === 'week' || raw === 'weekly' ? 'weekly' : raw === 'month' || raw === 'monthly' ? 'monthly' : 'daily'
  return queryGithub(window)
})
