import { ref } from 'vue'
import type { Screen } from '../types/models'

/** Returns true when the screen has a device with a recorded max resolution. */
export function hasMaxResolution(screen: Screen): boolean {
  const d = screen.attached_device
  return !!(d?.max_resolution_width && d?.max_resolution_height)
}

/** Returns true when the screen is currently showing at its device's max resolution. */
export function isFullscreen(screen: Screen): boolean {
  if (!hasMaxResolution(screen)) return false
  const d = screen.attached_device!
  return screen.resolution === `${d.max_resolution_width}x${d.max_resolution_height}`
}

/** Returns true when the screen is online and below its device's max resolution. */
export function isWindowed(screen: Screen): boolean {
  return !!(screen.attached_device?.is_online) && hasMaxResolution(screen) && !isFullscreen(screen)
}

export function useMaximizedFilter() {
  const showWindowed = ref(true)
  const showFullscreen = ref(true)

  const toggleShowWindowed = () => { showWindowed.value = !showWindowed.value }
  const toggleShowFullscreen = () => { showFullscreen.value = !showFullscreen.value }

  const applyMaximizedFilter = (list: Screen[]): Screen[] =>
    list.filter((screen) => {
      if (!hasMaxResolution(screen)) return true
      if (isWindowed(screen) && !showWindowed.value) return false
      if (isFullscreen(screen) && !showFullscreen.value) return false
      return true
    })

  return { showWindowed, showFullscreen, toggleShowWindowed, toggleShowFullscreen, applyMaximizedFilter }
}
