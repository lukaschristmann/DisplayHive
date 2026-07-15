import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useSocket } from '../composables/useSocket'

/**
 * The caller's own effective rights, fetched once per connection.
 *
 * This is UX gating only (hiding nav entries / buttons the user can't use) —
 * the actual security boundary is enforced server-side on every mutating
 * socket event (see application/socketio_handlers/auth.py require_right).
 * A stale or empty map here can at most show/hide UI incorrectly, never
 * grant access.
 */
export const useRightsStore = defineStore('rights', () => {
  const { emitWithAck } = useSocket()

  const rights = ref<Record<string, boolean>>({})
  const isSuperadmin = ref(false)
  const loaded = ref(false)

  type MyRightsResponse = { rights?: Record<string, boolean>; is_superadmin?: boolean }

  const handleMyRights = (data: MyRightsResponse) => {
    rights.value = data?.rights || {}
    isSuperadmin.value = !!data?.is_superadmin
    loaded.value = true
  }

  /** Fetch the caller's effective rights. Call after the socket connects (and again after login). */
  const fetchMyRights = async () => {
    try {
      const result = await emitWithAck<MyRightsResponse>('displayhive:admin:rights:cts:get_my_rights')
      handleMyRights(result)
    } catch {
      // Not connected yet — the on() listener below covers the fallback push, if any is added later.
    }
  }

  /** Whether the current user may perform *key* (e.g. "media.upload"). Defaults closed until loaded. */
  const can = (key: string): boolean => {
    if (!loaded.value) return false
    return !!rights.value[key]
  }

  const reset = () => {
    rights.value = {}
    isSuperadmin.value = false
    loaded.value = false
  }

  return {
    rights,
    isSuperadmin: computed(() => isSuperadmin.value),
    loaded,
    fetchMyRights,
    can,
    reset,
  }
})
