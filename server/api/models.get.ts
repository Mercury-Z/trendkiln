import { queryModels } from '~/demo/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const kind = String(query.kind ?? 'intelligence')
  const limit = Number(query.limit ?? 40)
  return queryModels(kind, limit)
})
