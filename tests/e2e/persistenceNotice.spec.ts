import { expect, test } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The bar of the shell that says the browser can not keep something, its list and its close.
 *
 * @remarks
 * The `persistedRef` reports a blocked storage into `persistenceProblems`, and the bar under the dock is what the author
 * sees of it (2026-11-22, the 66). The storage is taken away before the page runs, so every ref of the editor fails the
 * same way: the bar has the first message and the count of the rest, the count opens the list of every problem, and the
 * close empties the bar (the same failure stays quiet for the session).
 */
test('a blocked storage raises the notice, its list and the close hides it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: (): Storage => {
        throw new DOMException('the storage is blocked', 'SecurityError')
      },
    })
  })

  await page.goto(editorUrl())

  const notice = page.locator('.PersistenceNotice')

  await expect(notice).toBeVisible()

  // the bar says the first problem, and the count of the rest is a button
  await expect(notice).toContainText(/web storage/u)
  await expect(notice.locator('.more')).toHaveText(/^\+\d+ more$/u)

  // it is at the bottom of the shell, under the dock
  const box = await notice.boundingBox()
  const dock = await page.locator('.Dock').boundingBox()

  expect(box?.y).toBeGreaterThanOrEqual((dock?.y ?? 0) + (dock?.height ?? 0) - 1)

  // the count opens the list of every problem, with the key and the target of each
  await notice.locator('.more').click()

  const dialog = page.locator('.Modal .dialog[aria-label="The browser could not persist everything"]')

  await expect(dialog).toBeVisible()
  expect(await dialog.locator('.problem').count()).toBeGreaterThan(1)
  await expect(dialog).toContainText(/localStorage/u)

  // the dialog closes without closing the bar
  await page.keyboard.press('Escape')

  await expect(dialog).toHaveCount(0)
  await expect(notice).toBeVisible()

  await notice.getByRole('button', { name: 'Dismiss the warning' }).click()

  await expect(notice).toHaveCount(0)
})
