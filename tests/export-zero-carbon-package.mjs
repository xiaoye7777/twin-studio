import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true })
const context = await browser.newContext({ acceptDownloads:true })
const page = await context.newPage()
try {
  await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5190'}/projects`)
  await page.getByTestId('create-park-demo').click()
  const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem('digital-twin-studio-projects') || '[]').at(-1).id)
  const card = page.getByTestId(`project-card-${projectId}`)
  await card.getByTestId('project-menu').click()
  const download = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid="export-project"]:visible').click()]).then(([item]) => item)
  const output = resolve(process.argv[2] || '../dashboard-viewer-demo/public/zero-carbon-demo.twin.zip')
  await download.saveAs(output)
  console.log(JSON.stringify({ projectId, output }))
} finally { await context.close(); await browser.close() }
