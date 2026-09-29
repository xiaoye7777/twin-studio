import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5178'
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${base}/projects`)
  await page.getByTestId('create-park-demo').click()
  await page.waitForFunction(() => {
    const projects = JSON.parse(localStorage.getItem('digital-twin-studio-projects') || '[]')
    return projects.at(-1)?.name === '零碳智慧园区 Demo'
  })
  const seeded = await page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('digital-twin-studio-projects') || '[]')
    const project = projects.at(-1)
    const scene = JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${project.id}`))
    return { project, counts: { primitives: scene.primitives.length, bindings: scene.bindings.length, rules: scene.visualRules.length, interactions: scene.interactions.length, effects: scene.effects.length } }
  })
  assert.equal(seeded.counts.bindings, 8)
  assert.equal(seeded.counts.rules, 16)
  assert.equal(seeded.counts.interactions, 32)
  assert(seeded.counts.primitives >= 50)
  const card = page.getByTestId(`project-card-${seeded.project.id}`)
  await card.hover()
  await card.getByTestId('edit-project').click()
  await page.waitForURL(`**/editor/${seeded.project.id}`)
  await page.waitForSelector('[data-testid="editor-viewport"] canvas')
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="scene-document-debug"]')?.textContent || '{}').bindings?.length === 8)

  await page.evaluate(async id => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(`/projects/${id}/dashboard`), seeded.project.id)
  await page.waitForSelector('[data-testid="twin-scene-viewer"][data-loaded="true"]')
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="project-dashboard"]')?.dataset.runtimeRevision || 0) > 0)
  assert.equal(await page.getByTestId('project-dashboard').getAttribute('data-device-count'), '8')
  for (const testId of ['dashboard-average-soc', 'dashboard-average-temperature', 'dashboard-total-power']) {
    assert.notEqual((await page.getByTestId(testId).textContent()).trim(), '—')
  }
  await page.waitForTimeout(3500)
  await page.screenshot({ path: '/tmp/zero-carbon-park-dashboard.png', fullPage: true })
  await page.evaluate(() => { window.demoViewer = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed })
  assert(await page.evaluate(() => window.demoViewer.focusDevice('ESS-001')))
  const canvas = await page.locator('[data-testid="twin-scene-viewer"] canvas').boundingBox()
  const hit = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }
  await page.mouse.move(hit.x, hit.y)
  await page.waitForFunction(() => window.demoViewer.getInteractionDiagnostics()?.hoverTarget?.nodeId === 'ess-1')
  await page.mouse.click(hit.x, hit.y)
  await page.waitForFunction(() => window.demoViewer.getSelection()?.deviceId === 'ESS-001')
  await page.waitForSelector('[data-testid="dashboard-interaction-event"]')
  assert((await page.getByTestId('dashboard-interaction-event').textContent()).includes('open-device-detail'))
  assert.equal(await page.getByTestId('project-dashboard').getAttribute('data-selected-device-id'), 'ESS-001')
  await page.mouse.dblclick(hit.x, hit.y)
  await page.waitForTimeout(1700)
  await page.getByTestId('dashboard-device-ESS-002').click()
  await page.waitForFunction(() => window.demoViewer.getSelection()?.deviceId === 'ESS-002')
  const ticks = await page.locator('[data-testid="twin-scene-viewer"]').getAttribute('data-mock-ticks')
  await page.waitForFunction(before => Number(document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.mockTicks || 0) > Number(before), ticks)
  const runtime = await page.evaluate(() => ({
    rule: window.demoViewer.getRuleDiagnostics(), interaction: window.demoViewer.getInteractionDiagnostics(), effect: window.demoViewer.getEffectDiagnostics(),
  }))
  assert.equal(Object.keys(runtime.rule.rules).length, 16); assert.equal(runtime.interaction.total, 32)
  assert(!Object.values(runtime.rule.rules).some(rule => rule.status === 'unresolved')); assert.equal(runtime.interaction.unresolved.length, 0)
  await page.screenshot({ path: '/tmp/zero-carbon-park-focused.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ projectId: seeded.project.id, ...seeded.counts, mock: 'PASS', rules: runtime.rule, interactions: runtime.interaction, screenshot: '/tmp/zero-carbon-park-dashboard.png' }, null, 2))
} finally { await context.close(); await browser.close() }
