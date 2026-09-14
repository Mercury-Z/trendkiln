import { ref } from 'vue'
import { setItemState } from './useDemoStore'

/** Read / saved flags for feed + digest items. */
export function useItemActions() {
  const version = ref(0)

  async function markRead(itemType: string, itemId: string | number, read = true) {
    setItemState(itemType, itemId, { read })
    version.value++
  }

  async function markSaved(itemType: string, itemId: string | number, saved: boolean) {
    setItemState(itemType, itemId, { saved })
    version.value++
  }

  return { setItemState, markRead, markSaved, version }
}
