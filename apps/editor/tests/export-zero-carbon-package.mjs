import { resolve } from 'node:path'

import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  // CHROME_PATH selects a local Chrome; otherwise Playwright's own Chromium is used.
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
})
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()
try {
  await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5190'}/projects`)
  await page.getByTestId('create-park-demo').click()
  const projectId = await page.evaluate(
    () => JSON.parse(localStorage.getItem('digital-twin-studio-projects') || '[]').at(-1).id,
  )
  const card = page.getByTestId(`project-card-${projectId}`)
  await card.getByTestId('project-menu').click()
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-project"]:visible').click(),
  ]).then(([item]) => item)
  const output = resolve(process.argv[2] || '../dashboard-demo/public/zero-carbon-demo.twin.zip')
  await download.saveAs(output)
  console.log(JSON.stringify({ projectId, output }))
} finally {
  await context.close()
  await browser.close()
}
