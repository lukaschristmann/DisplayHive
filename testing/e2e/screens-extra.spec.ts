/**
 * E2E tests for additional Screens admin page features (/screens).
 *
 * Covered (extending the existing screens.spec.ts):
 *  1.  Edit screen name — dialog renames the screen and the row updates
 *  2.  Text filter narrows the screens table
 *  3.  Screen resolution is displayed in the row after creation with dimensions
 *  4.  Template override — assigning a template via edit dialog is persisted and
 *      reflected in the screen row / detail
 *
 * Strategy:
 *  - One screen is seeded via the UI dialog (Add Screen) and used across tests.
 *  - A template is seeded via socket to test the template-override flow.
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

async function gotoScreens(page: Page, workerBackendUrl: string) {
  await page.addInitScript((url: string) => {
    ;(window as any).__DISPLAYHIVE_TEST_BACKEND_URL__ = url
  }, workerBackendUrl)
  await page.goto(`${adminUrl}/screens`)
  await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 10_000 })
}

/** Create a template via socket and return its id. */
async function seedTemplate(page: Page, name: string): Promise<number> {
  return page.evaluate(
    ({ name }: { name: string }) =>
      new Promise<number>((resolve, reject) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { reject(new Error('Socket not available')); return }
        const t = setTimeout(() => reject(new Error('Timed out waiting for upd_templates')), 10_000)
        // The server may broadcast upd_templates for unrelated reasons before the
        // one carrying our newly created template — keep listening until we see it.
        const onUpdTemplates = (data: any) => {
          const list: any[] = data?.data || []
          const tpl = list.find((item: any) => item.name === name)
          if (!tpl) return
          clearTimeout(t)
          socket.off('displayhive:admin:stc:upd_templates', onUpdTemplates)
          resolve(Number(tpl.id))
        }
        socket.on('displayhive:admin:stc:upd_templates', onUpdTemplates)
        socket.emit('displayhive:admin:cts:create_template', { name, html: '', css: '' })
      }),
    { name },
  )
}

/** Delete a template by id via socket. */
async function deleteTemplateById(page: Page, id: number): Promise<void> {
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

async function deleteScreenByRow(page: Page, screenName: string) {
  const row = page.locator('tr', { hasText: screenName })
  await expect(row).toBeVisible({ timeout: 5_000 })
  await row.locator('button:has(.pi-trash)').click()
  const confirmMsg = page.getByText(`Are you sure you want to delete screen "${screenName}"?`)
  await expect(confirmMsg).toBeVisible({ timeout: 5_000 })
  const acceptBtn = page.getByRole('button', { name: /^(Yes|Confirm|Delete|OK|Accept)$/i })
  if ((await acceptBtn.count()) > 0) {
    await acceptBtn.first().click()
  } else {
    await page
      .locator(
        '.p-confirm-dialog .p-button-danger, .p-confirm-dialog .p-confirm-dialog-accept, button.p-button-danger',
      )
      .first()
      .click()
  }
  await expect(page.locator('tr', { hasText: screenName })).toHaveCount(0, { timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------

test.describe('Screens page — extra tests', () => {
  const screenName = `e2e-scrx-${Math.random().toString(36).slice(2, 8)}`
  const screenNameHolder = { current: screenName }
  let tplId = 0

  // ---------------------------------------------------------------------------
  // 0. Create screen via UI (setup for subsequent tests)
  // ---------------------------------------------------------------------------

  test('add screen with resolution — row shows resolution', async ({ page, backendUrl }) => {
    await gotoScreens(page, backendUrl)

    await page.getByRole('button', { name: 'Add Screen' }).click()
    const dialog = page.locator('.p-dialog', { hasText: 'Add Screen' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await dialog.locator('#create-name').fill(screenName)
    await dialog.locator('#create-width').fill('1280')
    await dialog.locator('#create-height').fill('720')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const row = page.locator('tr', { hasText: screenName })
    await expect(row).toBeVisible({ timeout: 10_000 })
    // Resolution should be visible in the row
    await expect(row).toContainText('1280')
  })

  // ---------------------------------------------------------------------------
  // 1. Edit screen name
  // ---------------------------------------------------------------------------

  test('edit dialog renames the screen and row updates', async ({ page, backendUrl }) => {
    await gotoScreens(page, backendUrl)

    const row = page.locator('tr', { hasText: screenNameHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })
    // The DataTable overlays a loading mask (screensStore.loading) that can
    // intercept clicks on rows underneath it.
    await expect(page.locator('.p-datatable-mask')).toBeHidden({ timeout: 10_000 })
    await row.locator('button:has(.pi-pencil)').click()

    const dialog = page.locator('.p-dialog', { hasText: 'Rename Screen' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const newName = `${screenNameHolder.current}-ren`
    const nameInput = dialog.locator('input[id*="name"], input[placeholder*="name" i]').first()
    await nameInput.clear()
    await nameInput.fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    await expect(page.locator('tr', { hasText: newName })).toBeVisible({ timeout: 10_000 })
    screenNameHolder.current = newName
  })

  // ---------------------------------------------------------------------------
  // 2. Text filter narrows the screens table
  // ---------------------------------------------------------------------------

  test('text filter hides non-matching rows and reveals matching ones', async ({
    page,
    backendUrl,
  }) => {
    await gotoScreens(page, backendUrl)

    const row = page.locator('tr', { hasText: screenNameHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })

    const filterInput = page
      .locator('.filter-input input, input[placeholder*="filter" i], input[placeholder*="search" i]')
      .first()
    await filterInput.fill('__no_match_xyz__')
    await expect(row).toBeHidden({ timeout: 3_000 })

    await filterInput.fill(screenNameHolder.current.slice(0, 8))
    await expect(row).toBeVisible({ timeout: 3_000 })

    await filterInput.fill('')
  })

  // ---------------------------------------------------------------------------
  // 3. Template override — assign a template to the screen via the edit dialog
  // ---------------------------------------------------------------------------

  test('assign template override — persisted and visible in the screen row', async ({
    page,
    backendUrl,
  }) => {
    await gotoScreens(page, backendUrl)

    // Seed a template to assign
    const tplName = `e2e-scrx-tpl-${Math.random().toString(36).slice(2, 8)}`
    tplId = await seedTemplate(page, tplName)
    expect(tplId).toBeGreaterThan(0)

    await page.reload()
    await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 10_000 })

    const row = page.locator('tr', { hasText: screenNameHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })
    // The DataTable overlays a loading mask (screensStore.loading) that can
    // intercept clicks on rows underneath it right after a reload/refetch.
    await expect(page.locator('.p-datatable-mask')).toBeHidden({ timeout: 10_000 })
    await row.locator('button:has(.pi-pencil)').click()

    const dialog = page.locator('.p-dialog', { hasText: 'Rename Screen' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Open the template dropdown (only one .p-select in this dialog)
    await dialog.locator('.p-select').click()

    // Pick the option matching our seeded template
    const option = page.locator('.p-select-option', { hasText: tplName })
    await expect(option).toBeVisible({ timeout: 5_000 })
    await option.click()

    // Register listener BEFORE clicking Save so we don't miss the upd_admin_screen event
    const screenUpdateReceived = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(); return }
          const t = setTimeout(() => resolve(), 5_000)
          socket.once('displayhive:admin:stc:upd_admin_screen', () => { clearTimeout(t); resolve() })
        }),
    )

    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    // Wait for the server to process rename and push updated screen data (with template_id)
    await screenUpdateReceived

    // Re-open the dialog to verify the template was persisted. The
    // upd_admin_screen push above can retrigger the DataTable's loading mask,
    // so wait for it to clear before clicking through the mask again.
    await expect(page.locator('.p-datatable-mask')).toBeHidden({ timeout: 10_000 })
    await row.locator('button:has(.pi-pencil)').click()
    const dialogRecheck = page.locator('.p-dialog', { hasText: 'Rename Screen' })
    await expect(dialogRecheck).toBeVisible({ timeout: 5_000 })
    await expect(dialogRecheck.locator('.p-select-label')).toContainText(tplName, { timeout: 5_000 })
    await dialogRecheck.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialogRecheck).toBeHidden({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  test('cleanup: delete seeded screen and template', async ({ page, backendUrl }) => {
    await gotoScreens(page, backendUrl)
    await deleteScreenByRow(page, screenNameHolder.current)
    if (tplId > 0) await deleteTemplateById(page, tplId)
  })
})
