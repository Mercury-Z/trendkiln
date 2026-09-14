export default defineEventHandler(async (event) => {
  const body = await readBody<{
    item_type?: string
    item_id?: string | number
    read?: boolean
    saved?: boolean
  }>(event)
  return {
    source: 'db',
    item_type: body?.item_type ?? null,
    item_id: body?.item_id ?? null,
    read: body?.read,
    saved: body?.saved,
  }
})
