import { deriveSignals } from '~/demo/db'

/**
 * Stateless in the static replica: the client keeps watchlist changes in
 * localStorage. The endpoint mirrors the original contract so the API surface
 * is identical when running under an SSR runtime.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ target_type?: string; target_key?: string; note?: string | null }>(event)
  const target_type = String(body?.target_type ?? '').trim()
  const target_key = String(body?.target_key ?? '').trim()
  if (!target_type || !target_key) {
    throw createError({ statusCode: 400, statusMessage: 'target_type and target_key are required' })
  }
  const now = new Date().toISOString()
  return {
    source: 'db',
    item: {
      id: '0',
      target_type,
      target_key,
      note: body?.note ?? null,
      created_at: now,
      last_signal_at: now,
      signals: deriveSignals(target_type, target_key),
    },
  }
})
