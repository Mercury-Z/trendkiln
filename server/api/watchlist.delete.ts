export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; target_type?: string; target_key?: string }>(event)
  return { source: 'db', removed: body ?? null }
})
