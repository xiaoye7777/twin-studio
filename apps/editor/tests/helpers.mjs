// Shared helpers for the browser suites: one isolated browser context per suite, the editor session exposed
// on window.__studio in dev builds, and small waits on its state instead of fixed delays.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

export async function launch() {
  const browser = await chromium.launch({
    // CHROME_PATH selects a local Chrome; otherwise Playwright's own Chromium is used.
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
  })
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  return {
    browser,
    context,
    page,
    errors,
    async close() {
      await context.close()
      await browser.close()
    },
  }
}

/** Waits until the editor finished opening the project. */
export async function waitForStudio(page) {
  await page.waitForFunction(() => window.__studio?.ui.ready === true, null, { timeout: 60000 })
  const error = await page.evaluate(() => window.__studio.ui.error)
  assert.equal(error, '')
}

/** Runs a function against the open editor session in the page. */
export function studio(page, fn, arg) {
  return page.evaluate(fn, arg)
}

/** Waits until every queued document update has reached the 3D scene. */
export async function settled(page) {
  await page.evaluate(() => window.__studio.sync.settled())
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

/** Creates the zero-carbon sample from the project page; it opens in the editor. Returns its project id. */
export async function createDemo(page, baseUrl) {
  await page.goto(`${baseUrl}/projects`)
  await page.getByTestId('create-park-demo').click()
  await page.waitForURL(/\/editor\/zero-carbon-/)
  await waitForStudio(page)
  return page.evaluate(() => window.__studio.projectId)
}

/** Points the project's WebSocket source at a port through the scene → data panel. */
export async function setDataSource(page, port) {
  await page.keyboard.press('Escape')
  await page.getByTestId('scene-tab-data').click()
  const input = page.getByTestId('datasource-url')
  await input.fill(`ws://127.0.0.1:${port}/realtime`)
  await input.press('Enter')
  await input.blur()
  await page.waitForFunction(() => window.__studio.twin.dataSourceStatus === 'connected', null, { timeout: 20000 })
}

/** Saves with the keyboard shortcut and waits for the confirmation in the top bar. */
export async function save(page) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await page.waitForFunction(() => document.querySelector('[data-testid="save-state"]')?.textContent.includes('已保存'))
}

/** Screen coordinates of a node's centre (for real pointer input on the canvas). */
export function screenPointOf(page, nodeId) {
  return page.evaluate(id => {
    const s = window.__studio
    const object = s.sync.objectFor(id)
    // Box3 and Vector3 come from the page's own three.js instance (via existing objects).
    const box = new s.engine.contentBounds.constructor().setFromObject(object, true)
    const center = box.getCenter(object.position.clone()).project(s.engine.camera)
    const rect = s.canvas.getBoundingClientRect()
    return { x: rect.left + ((center.x + 1) / 2) * rect.width, y: rect.top + ((1 - center.y) / 2) * rect.height }
  }, nodeId)
}

export const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
