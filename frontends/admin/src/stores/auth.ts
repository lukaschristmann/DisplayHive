import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useSocket } from '../composables/useSocket'

const TOKEN_STORAGE_KEY = 'displayhive_admin_token'
const USERNAME_STORAGE_KEY = 'displayhive_admin_username'

/**
 * Admin authentication store: holds the current JWT + username, persists
 * them to sessionStorage, and drives login/logout against the backend.
 *
 * sessionStorage (rather than localStorage) is used deliberately: the token is
 * not written to disk, is cleared when the tab closes, and is not shared with
 * other tabs — shrinking the window and blast radius of any token theft. The
 * JWT must stay readable by JS because it is sent as a Bearer header for HTTP
 * admin API calls and as `auth.token` in the Socket.IO handshake (see
 * composables/useSocket.ts); an httpOnly cookie would remove even that exposure
 * but requires server-side session + CSRF handling.
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(sessionStorage.getItem(TOKEN_STORAGE_KEY))
  const username = ref<string | null>(sessionStorage.getItem(USERNAME_STORAGE_KEY))
  // Starts true whenever a token is present so the app doesn't flash the
  // login form while `restore()` confirms the token is still valid.
  const restoring = ref(!!token.value)

  const isAuthenticated = computed(() => !!token.value)

  const setSession = (newToken: string, newUsername: string) => {
    token.value = newToken
    username.value = newUsername
    sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken)
    sessionStorage.setItem(USERNAME_STORAGE_KEY, newUsername)
  }

  const clearSession = () => {
    token.value = null
    username.value = null
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(USERNAME_STORAGE_KEY)
  }

  /**
   * Authenticate against the backend. Returns an error message on failure,
   * or null on success (matching the socket emitWithAck convention used
   * elsewhere in the SPA).
   */
  const login = async (usernameInput: string, password: string): Promise<string | null> => {
    try {
      const response = await fetch('/admin/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        return result.error || 'Login failed'
      }
      setSession(result.token, result.username)
      return null
    } catch (e) {
      return `Could not reach server: ${e}`
    }
  }

  /** Clear the session and disconnect the socket. */
  const logout = () => {
    clearSession()
    const { disconnect } = useSocket()
    disconnect()
  }

  /**
   * Validate a stored token against the backend on app boot. Clears the
   * session if the token is missing/expired/invalid (e.g. the user was
   * deleted since the token was issued).
   */
  const restore = async () => {
    if (!token.value) {
      restoring.value = false
      return
    }
    try {
      const response = await fetch('/admin/api/auth/me', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      if (!response.ok) {
        clearSession()
      } else {
        const result = await response.json()
        if (result.username) username.value = result.username
      }
    } catch {
      // Network error: keep the stored token: the socket connect attempt
      // will fail/retry, and the header check above will run again on reload.
    } finally {
      restoring.value = false
    }
  }

  /** Returns an `Authorization` header object for authenticated fetch() calls. */
  const authHeader = (): Record<string, string> =>
    token.value ? { Authorization: `Bearer ${token.value}` } : {}

  return {
    token,
    username,
    restoring,
    isAuthenticated,
    login,
    logout,
    restore,
    authHeader,
  }
})
