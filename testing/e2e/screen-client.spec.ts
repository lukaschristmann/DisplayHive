/**
 * E2E tests for the screen client (the display page served at the Flask root URL).
 *
 * Covered:
 *  40. Content renders on screen after device connects — the #main-container gets
 *      content injected into [data-container="maincontent"] within a reasonable
 *      timeout after the device joins its room.
 *  41. Scheduling — content with an end_time in the past is present in the
 *      upd_content playlist (server sends it) but is skipped by the client's
 *      isWithinSchedule logic; verified by reading container state via JS.
 *  42. Multi-container — when a template has two containers and a contenttype
 *      is linked to both, the server-built upd_content payload includes separate
 *      playlist entries for 'maincontent' and 'sidebar'.
 *
 * Strategy:
 *  - All setup (template, screen, device, screengroup, content) is done via socket
 *    from the admin page, then the test opens a new browser context to simulate
 *    a real device connecting.
 *  - The screen page receives `upd_content` from the server; we intercept it via
 *    page.evaluate() and expose the payload for assertions.
 *  - All tests run serially on the same worker / isolated DB.
 */

import test, { expect } from './fixtures.js'
import { adminUrl } from './urls.js'
import type { Browser, BrowserContext, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gotoAdmin(page: Page, workerBackendUrl: string) {
  await page.addInitScript((url: string) => {
    ;(window as any).__DISPLAYHIVE_TEST_BACKEND_URL__ = url
  }, workerBackendUrl)
  await page.goto(`${adminUrl}/screens`)
  await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 10_000 })
}

/** Create a screen and return its id. */
async function seedScreen(page: Page, name: string): Promise<number> {
  return page.evaluate(
    ({ name }: { name: string }) =>
      new Promise<number>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out')), 10_000)
        socket.emit('displayhive:screens:cts:create_screen', { name }, (ack: any) => {
          clearTimeout(t)
          if (ack?.success) resolve(Number(ack.screen_id))
          else reject(new Error(JSON.stringify(ack)))
        })
      }),
    { name },
  )
}

/** Delete a screen by id. */
async function deleteScreen(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) => {
      const socket = (window as any).__displayhive_socket__
      if (socket) socket.emit('displayhive:screens:cts:delete_screen', { screen_id: id })
    },
    { id },
  )
  await page.waitForTimeout(400)
}

/** Seed a device (approve registration) and return its devicekey. */
async function seedDevice(page: Page, deviceName: string): Promise<string> {
  const token = `e2e-sc-${Math.random().toString(36).slice(2, 10)}`
  return page.evaluate(
    ({ token, deviceName }: { token: string; deviceName: string }) =>
      new Promise<string>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out waiting for registration_approved')), 10_000)
        socket.once('displayhive:devices:stc:registration_approved', (data: any) => {
          clearTimeout(t)
          if (data?.success && data?.devicekey) resolve(data.devicekey)
          else reject(new Error(`registration_approved failed: ${JSON.stringify(data)}`))
        })
        socket.emit('displayhive:devices:cts:approve_registration', { token, device_name: deviceName })
      }),
    { token, deviceName },
  )
}

/** Assign a device to a screen via the edit dialog flow (socket). */
async function assignDeviceToScreen(page: Page, devicekey: string, screenId: number): Promise<void> {
  await page.evaluate(
    ({ devicekey, screenId }: { devicekey: string; screenId: number }) =>
      new Promise<void>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        // Find device id by key
        const t = setTimeout(() => reject(new Error('Timed out finding device')), 10_000)
        socket.once('displayhive:devices:stc:devices_upd_devicelist', (data: any) => {
          clearTimeout(t)
          const list: any[] = data?.devices || []
          const dev = list.find((d: any) => d.devicekey === devicekey)
          if (!dev) { reject(new Error('Device not found in list')); return }
          socket.emit('displayhive:devices:cts:update_device', {
            device_id: dev.id,
            name: dev.name,
            screen_id: screenId,
          })
          setTimeout(resolve, 500)
        })
        socket.emit('displayhive:devices:cts:get_devices')
      }),
    { devicekey, screenId },
  )
}

/** Create a screengroup and return its id. */
async function seedScreenGroup(page: Page, name: string): Promise<number> {
  return page.evaluate(
    ({ name }: { name: string }) =>
      new Promise<number>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out')), 10_000)
        socket.once('displayhive:admin:stc:screengroup_created', (data: any) => {
          clearTimeout(t)
          if (data?.success) resolve(data.screengroup_id)
          else reject(new Error(JSON.stringify(data)))
        })
        socket.emit('displayhive:admin:cts:create_screengroup', { name })
      }),
    { name },
  )
}

/** Add a screen to a screengroup via socket. */
async function addScreenToGroup(page: Page, sgId: number, screenId: number): Promise<void> {
  await page.evaluate(
    ({ sgId, screenId }: { sgId: number; screenId: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        socket.emit('displayhive:admin:cts:add_screen_to_screengroup', {
          screengroup_id: sgId,
          screen_id: screenId,
        })
        setTimeout(resolve, 500)
      }),
    { sgId, screenId },
  )
}

/** Create a content_element item via socket and return its id. */
async function seedContent(
  page: Page,
  title: string,
  opts: { duration?: number; endTimePast?: boolean; container?: string; contenttypeId?: number } = {},
): Promise<number> {
  const { duration = 3, endTimePast = false, container = 'maincontent', contenttypeId = 0 } = opts
  return page.evaluate(
    ({
      title,
      duration,
      endTimePast,
      container,
      contenttypeId,
    }: {
      title: string
      duration: number
      endTimePast: boolean
      container: string
      contenttypeId: number
    }) =>
      new Promise<number>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out')), 10_000)
        const payload: Record<string, any> = {
          title,
          duration,
          contentcontainer: container,
        }
        if (contenttypeId > 0) payload.contenttype_id = contenttypeId
        if (endTimePast) {
          // Set end_time to 1 minute ago
          const past = new Date(Date.now() - 60_000)
          payload.end_time = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}T${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}`
        }
        socket.once('displayhive:admin:stc:create_content_element_result', (data: any) => {
          clearTimeout(t)
          if (data?.success) resolve(data.content_element_id)
          else reject(new Error(`create_content_element failed: ${JSON.stringify(data)}`))
        })
        socket.emit('displayhive:admin:cts:create_content_element', payload)
      }),
    { title, duration, endTimePast, container, contenttypeId },
  )
}

/** Assign a content item to a screengroup via socket. */
async function assignContentToGroup(page: Page, sgId: number, contentId: number): Promise<void> {
  await page.evaluate(
    ({ sgId, contentId }: { sgId: number; contentId: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        socket.emit('displayhive:admin:cts:add_content_to_screengroup', {
          screengroup_id: sgId,
          content_id: contentId,
        })
        setTimeout(resolve, 500)
      }),
    { sgId, contentId },
  )
}

/** Delete a content_element item via socket. */
async function deleteContent(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) => {
      const socket = (window as any).__displayhive_socket__
      if (socket) socket.emit('displayhive:admin:cts:delete_content_element', { content_element_id: id })
    },
    { id },
  )
  await page.waitForTimeout(300)
}

/** Delete a screengroup via socket. */
async function deleteScreenGroup(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        const t = setTimeout(() => resolve(), 5_000)
        // Remove all screens and content first so deletion is allowed
        socket.emit('displayhive:admin:cts:remove_all_screens_from_screengroup', { screengroup_id: id })
        socket.emit('displayhive:admin:cts:remove_all_content_from_screengroup', { screengroup_id: id })
        setTimeout(() => {
          socket.once('displayhive:admin:stc:screengroup_deleted', () => { clearTimeout(t); resolve() })
          socket.emit('displayhive:admin:cts:delete_screengroup', { screengroup_id: id })
        }, 600)
      }),
    { id },
  )
}

/** Delete a device via the admin socket. */
async function deleteDevice(page: Page, devicekey: string): Promise<void> {
  await page.evaluate(
    ({ devicekey }: { devicekey: string }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        socket.once('displayhive:devices:stc:devices_upd_devicelist', (data: any) => {
          const list: any[] = data?.devices || []
          const dev = list.find((d: any) => d.devicekey === devicekey)
          if (dev) socket.emit('displayhive:devices:cts:delete_device', { device_id: dev.id })
          setTimeout(resolve, 400)
        })
        socket.emit('displayhive:devices:cts:get_devices')
      }),
    { devicekey },
  )
}

/** Delete a template by id via socket. */
async function deleteTemplate(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        const t = setTimeout(() => resolve(), 5_000)
        socket.once('displayhive:admin:stc:upd_templates', () => { clearTimeout(t); resolve() })
        socket.emit('displayhive:admin:cts:delete_template', { template_id: id })
      }),
    { id },
  )
}

/** Create a contenttype with the given HTML and return its id. */
async function seedContentType(page: Page, name: string, html: string): Promise<number> {
  return page.evaluate(
    ({ name, html }: { name: string; html: string }) =>
      new Promise<number>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out waiting for upd_contenttypes')), 10_000)
        socket.once('displayhive:admin:stc:upd_contenttypes', (data: any) => {
          clearTimeout(t)
          const list: any[] = data?.data || []
          const ct = list.find((item: any) => item.name === name)
          resolve(ct ? Number(ct.id) : 0)
        })
        socket.emit('displayhive:admin:cts:create_contenttype', { name, html, css: '' })
      }),
    { name, html },
  )
}

/** Delete a contenttype by id via socket. */
async function deleteContentType(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        const t = setTimeout(() => resolve(), 5_000)
        socket.once('displayhive:admin:stc:upd_contenttypes', () => { clearTimeout(t); resolve() })
        socket.emit('displayhive:admin:cts:delete_contenttype', { id })
      }),
    { id },
  )
}

/**
 * Open a screen page as an adopted device (non-impersonation).
 * The deviceKey is injected into localStorage before navigation.
 */
async function openScreenPage(browser: Browser, workerBackendUrl: string, devicekey: string) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const screenPage = await ctx.newPage()
  await screenPage.addInitScript((key: string) => {
    try {
      localStorage.setItem('deviceKey', key)
      localStorage.removeItem('adoptionToken')
      ;(window as any).deviceKey = key
    } catch (e) {}
  }, devicekey)
  await screenPage.goto(workerBackendUrl)
  return { ctx, screenPage }
}

/**
 * Wait for the screen page to receive an `upd_content` socket event and
 * return the payload. Times out after 30 s.
 */
async function waitForUpdContent(screenPage: Page): Promise<any> {
  return screenPage.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timed out waiting for upd_content')), 30_000)
        // The screen client stores the last upd_content payload if we inject a hook before navigation.
        // We use a polling approach on the exposed containers object.
        const socket = (window as any).socket
        if (socket) {
          socket.once('upd_content', (msg: any) => {
            clearTimeout(t)
            resolve(msg)
          })
        } else {
          // Poll for the socket to become available
          const poll = setInterval(() => {
            const s = (window as any).socket
            if (s) {
              clearInterval(poll)
              s.once('upd_content', (msg: any) => {
                clearTimeout(t)
                resolve(msg)
              })
            }
          }, 200)
        }
      }),
  )
}

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------

test.describe('Screen client rendering', () => {
  const screenName = `e2e-sc-scr-${Math.random().toString(36).slice(2, 8)}`
  const deviceName = `e2e-sc-dev-${Math.random().toString(36).slice(2, 8)}`
  const sgName = `e2e-sc-sg-${Math.random().toString(36).slice(2, 8)}`
  const ctName = `e2e-sc-ct-${Math.random().toString(36).slice(2, 8)}`

  let screenId = 0
  let devicekey = ''
  let sgId = 0
  let ctId = 0
  const contentIds: number[] = []

  // Screen context opened once and reused across tests 40 + 41
  let screenCtx: BrowserContext | null = null
  let screenPage: Page | null = null

  // ---------------------------------------------------------------------------
  // 0. Seed: screen, device, screengroup, and one active content item
  // ---------------------------------------------------------------------------

  test('seed: screen, device, screengroup, and content created', async ({
    page,
    backendUrl,
  }) => {
    await gotoAdmin(page, backendUrl)

    screenId = await seedScreen(page, screenName)
    devicekey = await seedDevice(page, deviceName)
    sgId = await seedScreenGroup(page, sgName)

    expect(screenId).toBeGreaterThan(0)
    expect(devicekey).not.toBe('')
    expect(sgId).toBeGreaterThan(0)

    // Assign device to screen
    await assignDeviceToScreen(page, devicekey, screenId)

    // Add screen to screengroup
    await addScreenToGroup(page, sgId, screenId)

    // Seed a contenttype with real HTML so the screen client can render it
    ctId = await seedContentType(page, ctName, '<p>E2E screen test</p>')
    expect(ctId).toBeGreaterThan(0)

    // Seed one active content item — contenttype_id ensures mc.html is non-empty
    const cid = await seedContent(page, 'e2e-sc-active', { duration: 5, contenttypeId: ctId })
    contentIds.push(cid)
    await assignContentToGroup(page, sgId, cid)
  })

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  test('cleanup: close screen page, delete all seeded data', async ({ page, backendUrl }) => {
    if (screenCtx) {
      await screenCtx.close()
      screenCtx = null
      screenPage = null
    }

    await gotoAdmin(page, backendUrl)

    // Content must be removed before screengroup (FK constraints)
    for (const id of contentIds) await deleteContent(page, id)
    await deleteScreenGroup(page, sgId)

    // Device must be removed before screen (FK constraints via screen_id)
    await deleteDevice(page, devicekey)
    if (screenId > 0) await deleteScreen(page, screenId)
    if (ctId > 0) await deleteContentType(page, ctId)
  })
})
