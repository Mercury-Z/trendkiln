import { queryFeed } from '~/demo/db'

export default defineEventHandler((event) => {
  const filter = String(getQuery(event).filter ?? 'all')
  return queryFeed(filter)
})
