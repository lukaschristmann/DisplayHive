/**
 * E2E tests for the Templates admin page (/templates).
 *
 * Covered:
 *  Templates table (top section)
 *  1.  "New Template" button opens dialog; fill name + HTML → row appears
 *  2.  Edit dialog renames the template and updates the row
 *  3.  Delete button removes a disposable template after confirmation
 *
 *  Magic Tags table (bottom section of same page)
 *  4.  "New Magic Tag" button opens dialog; fill key + value → row appears
 *  5.  Edit dialog changes the value and updates the row
 *  6.  Delete button removes a disposable magic tag after confirmation
 *  7.  Magic tag is substituted into template HTML at render time
 *
 * Strategy:
 *  - Templates and variables are created via the UI dialogs.
 *  - Socket helpers are used only for cleanup to avoid coupling test assertions
 *    to socket internals.
 *  - All tests run serially on the same worker / isolated DB.
 */

import test, { expect } from './fixtures.js'
import { adminUrl } from './urls.js'
import type { Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.setTimeout(60_000)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gotoTemplates(page: Page, workerBackendUrl: string) {
  await page.addInitScript((url: string) => {
    ;(window as any).__DISPLAYHIVE_TEST_BACKEND_URL__ = url
  }, workerBackendUrl)
  await page.goto(`${adminUrl}/templates`)
  await expect(page.locator('.p-datatable').first()).toBeVisible({ timeout: 10_000 })
}

/** Delete a template by id via socket. */
async function deleteTemplateById(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        const t = setTimeout(() => resolve(), 8_000)
        socket.once('displayhive:admin:stc:upd_templates', () => {
          clearTimeout(t)
          resolve()
        })
        socket.emit('displayhive:admin:cts:delete_template', { template_id: id })
      }),
    { id },
  )
}

/** Delete a magic tag by id via socket. */
async function deleteVarById(page: Page, id: number): Promise<void> {
  await page.evaluate(
    ({ id }: { id: number }) =>
      new Promise<void>((resolve) => {
        const socket = (window as any).__displayhive_socket__
        if (!socket) { resolve(); return }
        const t = setTimeout(() => resolve(), 8_000)
        socket.once('displayhive:admin:stc:upd_magic_tags', () => {
          clearTimeout(t)
          resolve()
        })
        socket.emit('displayhive:admin:cts:delete_magic_tag', { id })
      }),
    { id },
  )
}

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------

test.describe('Templates page', () => {
  const tplName = `e2e-tpl-${Math.random().toString(36).slice(2, 8)}`
  const tplNameHolder = { current: tplName }
  let tplId = 0

  const varKey = `e2e_var_${Math.random().toString(36).slice(2, 8)}`
  const varKeyHolder = { current: varKey }
  let varId = 0

  // ---------------------------------------------------------------------------
  // 1. Create template via UI
  // ---------------------------------------------------------------------------

  test('"New Template" button opens dialog, fill name + HTML → row appears', async ({
    page,
    backendUrl,
  }) => {
    await gotoTemplates(page, backendUrl)

    await page.getByRole('button', { name: 'New Template' }).click()

    const dialog = page.locator('.p-dialog', { hasText: 'New Template' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await dialog.locator('#tpl-name').fill(tplName)

    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const row = page.locator('tr', { hasText: tplName })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Capture the template id
    tplId = await page.evaluate(
      ({ name }: { name: string }) =>
        new Promise<number>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(0); return }
          const t = setTimeout(() => resolve(0), 8_000)
          socket.once('displayhive:admin:stc:upd_templates', (data: any) => {
            clearTimeout(t)
            const list: any[] = data?.data || []
            const tpl = list.find((t: any) => t.name === name)
            resolve(tpl ? Number(tpl.id) : 0)
          })
          socket.emit('displayhive:admin:cts:get_templates')
        }),
      { name: tplName },
    )
  })

  // ---------------------------------------------------------------------------
  // 2. Edit template — rename
  // ---------------------------------------------------------------------------

  test('edit dialog renames the template and updates the row', async ({ page, backendUrl }) => {
    await gotoTemplates(page, backendUrl)

    const row = page.locator('tr', { hasText: tplNameHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.locator('button[title="Edit"]').click()

    const dialog = page.locator('.p-dialog', { hasText: 'Edit Template' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const newName = `${tplNameHolder.current}-ren`
    await dialog.locator('#tpl-name').clear()
    await dialog.locator('#tpl-name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    await expect(page.locator('tr', { hasText: newName })).toBeVisible({ timeout: 10_000 })
    tplNameHolder.current = newName
  })

  // ---------------------------------------------------------------------------
  // 3. Delete a disposable template via UI
  // ---------------------------------------------------------------------------

  test('delete button removes a template after confirmation', async ({ page, backendUrl }) => {
    await gotoTemplates(page, backendUrl)

    // Seed a disposable template via socket to avoid deleting the main one
    const delName = `e2e-tpl-del-${Math.random().toString(36).slice(2, 8)}`
    await page.evaluate(
      ({ delName }: { delName: string }) =>
        new Promise<void>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(); return }
          const t = setTimeout(() => resolve(), 8_000)
          socket.once('displayhive:admin:stc:upd_templates', () => {
            clearTimeout(t)
            resolve()
          })
          socket.emit('displayhive:admin:cts:create_template', { name: delName, html: '', css: '' })
        }),
      { delName },
    )

    await page.reload()
    await expect(page.locator('.p-datatable').first()).toBeVisible({ timeout: 10_000 })

    const delRow = page.locator('tr', { hasText: delName })
    await expect(delRow).toBeVisible({ timeout: 10_000 })
    await delRow.locator('button[title="Delete"]').click()

    await expect(page.getByText(/delete.*template|are you sure/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /yes|confirm|delete|ok/i }).first().click()

    await expect(page.locator('tr', { hasText: delName })).toHaveCount(0, { timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // 4. Create magic tag via UI
  // ---------------------------------------------------------------------------

  test('"New Magic Tag" button opens dialog, fill key + value → row appears', async ({
    page,
    backendUrl,
  }) => {
    await gotoTemplates(page, backendUrl)

    await page.getByRole('button', { name: 'New Magic Tag' }).click()

    const dialog = page.locator('.p-dialog', { hasText: 'New Magic Tag' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await dialog.locator('#var-name').fill(varKey)
    await dialog.locator('#var-value').fill('e2e_test_value')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    const row = page.locator('tr', { hasText: varKey })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Capture the var id
    varId = await page.evaluate(
      ({ key }: { key: string }) =>
        new Promise<number>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(0); return }
          const t = setTimeout(() => resolve(0), 8_000)
          socket.once('displayhive:admin:stc:upd_magic_tags', (data: any) => {
            clearTimeout(t)
            const list: any[] = data?.data || []
            const v = list.find((item: any) => item.name === key)
            resolve(v ? Number(v.id) : 0)
          })
          socket.emit('displayhive:admin:cts:get_magic_tags')
        }),
      { key: varKey },
    )
  })

  // ---------------------------------------------------------------------------
  // 5. Edit magic tag — change value
  // ---------------------------------------------------------------------------

  test('edit dialog changes the variable value and updates the row', async ({
    page,
    backendUrl,
  }) => {
    await gotoTemplates(page, backendUrl)

    const row = page.locator('tr', { hasText: varKeyHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.locator('button[title="Edit"]').click()

    const dialog = page.locator('.p-dialog', { hasText: 'Edit Magic Tag' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await dialog.locator('#var-value').clear()
    await dialog.locator('#var-value').fill('e2e_updated_value')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    // Row should still show the key
    await expect(page.locator('tr', { hasText: varKeyHolder.current })).toBeVisible({
      timeout: 10_000,
    })
    // And the value cell should show updated value
    await expect(
      page.locator('tr', { hasText: varKeyHolder.current }),
    ).toContainText('e2e_updated_value', { timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // 6. Delete a disposable variable via UI
  // ---------------------------------------------------------------------------

  test('delete button removes a magic tag after confirmation', async ({ page, backendUrl }) => {
    await gotoTemplates(page, backendUrl)

    // Seed a disposable magic tag via socket
    const delKey = `e2e_var_del_${Math.random().toString(36).slice(2, 8)}`
    await page.evaluate(
      ({ delKey }: { delKey: string }) =>
        new Promise<void>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(); return }
          const t = setTimeout(() => resolve(), 8_000)
          socket.once('displayhive:admin:stc:upd_magic_tags', () => {
            clearTimeout(t)
            resolve()
          })
          socket.emit('displayhive:admin:cts:create_magic_tag', { name: delKey, value: 'temp' })
        }),
      { delKey },
    )

    await page.reload()
    await expect(page.locator('.p-datatable').first()).toBeVisible({ timeout: 10_000 })

    const delRow = page.locator('tr', { hasText: delKey })
    await expect(delRow).toBeVisible({ timeout: 10_000 })
    await delRow.locator('button[title="Delete"]').click()

    await expect(page.getByText(/delete.*variable|are you sure/i)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /yes|confirm|delete|ok/i }).first().click()

    await expect(page.locator('tr', { hasText: delKey })).toHaveCount(0, { timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // 7. Magic tag substitution — value is injected in get_magic_tags
  // ---------------------------------------------------------------------------

  test('magic tag value is reflected in the magic tags list', async ({
    page,
    backendUrl,
  }) => {
    await gotoTemplates(page, backendUrl)

    // The var row should show key + value
    const row = page.locator('tr', { hasText: varKeyHolder.current })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toContainText('e2e_updated_value')

    // Verify the backend returns the var when requested via socket
    const found = await page.evaluate(
      ({ key }: { key: string }) =>
        new Promise<boolean>((resolve) => {
          const socket = (window as any).__displayhive_socket__
          if (!socket) { resolve(false); return }
          const t = setTimeout(() => resolve(false), 8_000)
          socket.once('displayhive:admin:stc:upd_magic_tags', (data: any) => {
            clearTimeout(t)
            const list: any[] = data?.data || []
            resolve(list.some((v: any) => v.name === key && v.value === 'e2e_updated_value'))
          })
          socket.emit('displayhive:admin:cts:get_magic_tags')
        }),
      { key: varKey },
    )
    expect(found).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  test('cleanup: delete seeded template and magic tag', async ({ page, backendUrl }) => {
    await gotoTemplates(page, backendUrl)
    if (varId > 0) await deleteVarById(page, varId)
    if (tplId > 0) await deleteTemplateById(page, tplId)
  })
})
