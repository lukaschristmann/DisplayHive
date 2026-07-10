import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useSocket } from '../composables/useSocket'

/**
 * Holds the subset of admin system settings that other parts of the shell
 * (top bar, router) need to react to — currently just `hide_demo_mode`.
 * SettingsView.vue owns the full settings form independently; this store
 * exists so App.vue and the router guard can know the flag without each
 * re-implementing the socket round trip.
 */
export const useSettingsStore = defineStore('settings', () => {
  const hideDemoMode = ref(false)
  const loaded = ref(false)
  let listening = false

  const applyPayload = (data: unknown) => {
    const sys = (data as { system_settings?: Record<string, unknown> } | null)?.system_settings || {}
    hideDemoMode.value = sys.hide_demo_mode === true || sys.hide_demo_mode === 'true'
    loaded.value = true
  }

  const fetchSettings = () => {
    const { on, emit } = useSocket()
    if (!listening) {
      on('displayhive:admin:stc:admin_settings', applyPayload)
      listening = true
    }
    emit('displayhive:admin:cts:get_admin_settings')
  }

  return { hideDemoMode, loaded, fetchSettings }
})
