import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Picks the right localized string out of a payload field.
 *
 * Payload fields come in three shapes: a `{ zh, en }` object, flat
 * `field_zh` / `field_en` columns, or a single plain-text column. Mirrors the
 * original's `pickLocaleText` helper.
 */
export function useLocaleText() {
  const { locale } = useI18n()

  function activeLocale(): 'zh' | 'en' {
    return String(locale.value || 'zh').startsWith('zh') ? 'zh' : 'en'
  }

  function pickLocaleText(
    value: unknown,
    zh?: unknown,
    en?: unknown,
    fallback?: unknown,
  ): string {
    const cur = activeLocale()
    const other = cur === 'zh' ? 'en' : 'zh'

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const primary = obj[cur]
      if (typeof primary === 'string' && primary.trim()) return primary.trim()
      const secondary = obj[other]
      if (typeof secondary === 'string' && secondary.trim()) return secondary.trim()
    } else if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    const primaryFlat = cur === 'zh' ? zh : en
    if (typeof primaryFlat === 'string' && primaryFlat.trim()) return primaryFlat.trim()
    const secondaryFlat = cur === 'zh' ? en : zh
    if (typeof secondaryFlat === 'string' && secondaryFlat.trim()) return secondaryFlat.trim()
    if (typeof fallback === 'string' && fallback.trim()) return fallback.trim()
    return ''
  }

  return { pickLocaleText, activeLocale: computed(activeLocale) }
}
