import { ref } from 'vue'

/**
 * Composable that provides online/offline visibility toggles for list views.
 *
 * Encapsulates the repeated `showOnline` / `showOffline` pattern that appears
 * in DevicesView, ScreensView, and similar views.
 *
 * @example
 * ```ts
 * const { showOnline, showOffline, toggleShowOnline, toggleShowOffline, applyOnlineFilter } = useOnlineFilter()
 *
 * const filteredItems = computed(() =>
 *   applyOnlineFilter(items.value, (item) => item.is_online)
 * )
 * ```
 */
export function useOnlineFilter() {
  /** Controls whether online items are visible in the list. */
  const showOnline = ref(true)

  /** Controls whether offline items are visible in the list. */
  const showOffline = ref(true)

  /** Toggle the visibility of online items. */
  const toggleShowOnline = () => {
    showOnline.value = !showOnline.value
  }

  /** Toggle the visibility of offline items. */
  const toggleShowOffline = () => {
    showOffline.value = !showOffline.value
  }

  /**
   * Filter a list according to the current online/offline visibility state.
   *
   * @param list - The full array of items to filter.
   * @param isOnlineFn - A predicate that returns `true` when the item is considered online.
   * @returns A new array containing only the items that pass the current filter state.
   */
  const applyOnlineFilter = <T>(list: T[], isOnlineFn: (item: T) => boolean): T[] =>
    list.filter((item) => {
      const online = isOnlineFn(item)
      if (online && !showOnline.value) return false
      if (!online && !showOffline.value) return false
      return true
    })

  return { showOnline, showOffline, toggleShowOnline, toggleShowOffline, applyOnlineFilter }
}
