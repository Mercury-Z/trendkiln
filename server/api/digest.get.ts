import { queryDigest } from '~/demo/db'

export default defineEventHandler((event) => {
  const limit = Number(getQuery(event).limit ?? 5)
  return queryDigest(limit)
})
