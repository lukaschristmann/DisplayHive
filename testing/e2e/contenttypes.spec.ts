/**
 * E2E tests for the Content Types admin page (/contenttypes).
 *
 * Covered:
 *  1.  "New Content Type" button opens dialog; fill name → row appears in table
 *  2.  Text filter narrows the contenttypes table
 *  3.  Edit dialog renames the content type and updates the row
 *  4.  A second content type is created for delete testing (to avoid deleting
 *      the main one mid-suite)
 *  5.  Delete button removes the disposable content type after confirmation
 *
 * Strategy:
 *  - One content type is seeded via the UI dialog (test 1) and mutated in place.
 *  - A second disposable content type is created via socket for the delete test.
 *  - All tests run serially on the same worker / isolated DB.
 */

import test, { expect } from './fixtures.js'
import { adminUrl } from './urls.js'
import type { Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.setTimeout(45_000)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gotoContentTypes(page: Page, workerBackendUrl: string) {
  await page.addInitScript((url: string) => {
    ;(window as any).__DISPLAYHIVE_TEST_BACKEND_URL__ = url
  }, workerBackendUrl)
  await page.goto(`${adminUrl}/contenttypes`)
  await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 10_000 })
}

/** Create a content type via socket and return its name. Returns the name on success. */
async function seedContentType(page: Page, name: string): Promise<void> {
  await page.evaluate(
    ({ name }: { name: string }) =>
      new Promise<void>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out waiting for upd_contenttypes')), 10_000)
        socket.once('displayhive:admin:stc:upd_contenttypes', () => {
          clearTimeout(t)
          resolve()
        })
        socket.emit('displayhive:admin:cts:create_contenttype', { name, description: '', html: '', css: '' })
      }),
    { name },
  )
}

/** Delete a content type by id via socket. */
async function deleteContentTypeById(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        const t = setTimeout(() => resolve(), 8_000)
        socket.once('displayhive:admin:stc:upd_contenttypes', () => {
          clearTimeout(t)
          resolve()
        })
        socket.emit('displayhive:admin:cts:delete_contenttype', { id })
      }),
    { id },
  )
}

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------

test.describe('Content Types page', () => {
  const ctName = `e2e-ct-${Math.random().toString(36).slice(2, 8)}`
  const ctNameHolder = { current: ctName }
  let ctId = 0

  // ---------------------------------------------------------------------------
  // 1. Create content type via UI dialog
  // ---------------------------------------------------------------------------

  test('"New Content Type" button opens dialog, fill name, save → row appears', async ({
    page,
    backendUrl,
  }) => {
    await gotoContentTypes(page, backendUrl)

    await page.getByRole('button', { name: 'New Content Type' }).click()

    const dialog = page.locator('.p-dialog', { hasText: 'New Content Type' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await dialog.locator('#ct-name').fill(ctName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const row = page.locator('tr', { hasText: ctName })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Capture the id from the row by fetching the contenttypes list via socket
    ctId = await page.evaluate(
      ({ name }: { name: string }) =>
        new Promise<number>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(0); return }
          const t = setTimeout(() => resolve(0), 8_000)
          socket.once('displayhive:admin:stc:upd_contenttypes', (data: any) => {
            clearTimeout(t)
            const list: any[] = data?.data || []
            const ct = list.find((c: any) => c.name === name)
            resolve(ct ? Number(ct.id) : 0)
          })
          socket.emit('displayhive:admin:cts:get_contenttypes')
        }),
      { name: ctName },
    )
  })

  // ---------------------------------------------------------------------------
  // 2. Text filter narrows the content types table
  // ---------------------------------------------------------------------------

  test('text filter hides non-matching rows and reveals matching ones', async ({
    page,
    backendUrl,
  }) => {
    await gotoContentTypes(page, backendUrl)

    const row = page.locator('tr', { hasText: ctNameHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })

    const filterInput = page.locator('.filter-input input, input[placeholder*="filter" i], input[placeholder*="search" i]').first()
    await filterInput.fill('__no_match_xyz__')
    await expect(row).toBeHidden({ timeout: 3_000 })

    await filterInput.fill(ctNameHolder.current.slice(0, 8))
    await expect(row).toBeVisible({ timeout: 3_000 })

    await filterInput.fill('')
  })

  // ---------------------------------------------------------------------------
  // 3. Edit dialog renames the content type
  // ---------------------------------------------------------------------------

  test('edit dialog renames the content type and updates the row', async ({
    page,
    backendUrl,
  }) => {
    await gotoContentTypes(page, backendUrl)

    const row = page.locator('tr', { hasText: ctNameHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.locator('button[title="Edit"]').click()

    const dialog = page.locator('.p-dialog', { hasText: 'Edit Content Type' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const newName = `${ctNameHolder.current}-ren`
    await dialog.locator('#ct-name').clear()
    await dialog.locator('#ct-name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    await expect(page.locator('tr', { hasText: newName })).toBeVisible({ timeout: 10_000 })
    ctNameHolder.current = newName
  })

  // ---------------------------------------------------------------------------
  // 4 + 5. Create a disposable content type via socket, then delete it via UI
  // ---------------------------------------------------------------------------

  test('delete button removes a content type after confirmation', async ({
    page,
    backendUrl,
  }) => {
    await gotoContentTypes(page, backendUrl)

    // Seed a disposable content type to delete (avoids deleting the main one)
    const delName = `e2e-ct-del-${Math.random().toString(36).slice(2, 8)}`
    await seedContentType(page, delName)

    await page.reload()
    await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 10_000 })

    const row = page.locator('tr', { hasText: delName })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.locator('button[title="Delete"]').click()

    // Confirm deletion
    await expect(page.getByText(/delete.*content type|are you sure/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /yes|confirm|delete|ok/i }).first().click()

    await expect(page.locator('tr', { hasText: delName })).toHaveCount(0, { timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  test('cleanup: delete the main seeded content type', async ({ page, backendUrl }) => {
    await gotoContentTypes(page, backendUrl)
    if (ctId > 0) {
      await deleteContentTypeById(page, ctId)
      await page.reload()
      await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('tr', { hasText: ctNameHolder.current })).toHaveCount(0, {
        timeout: 5_000,
      })
    }
  })
})
