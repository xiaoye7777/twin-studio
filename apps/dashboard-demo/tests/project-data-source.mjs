import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Both dev servers must be running. All Editor data is isolated in this browser context.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const editor = process.env.EDITOR_URL || 'http://127.0.0.1:5190'
const dashboard = process.env.TEST_BASE_URL || 'http://127.0.0.1:5200'
// Must match the realtime server's TWIN_DATA_PORT; the exported package points at this address.
const dataPort = process.env.TWIN_DATA_PORT || '8787'
const status = async () => (await (await fetch(`http://127.0.0.1:${dataPort}/status`)).json()).connections
const waitConnections = async count => {
  for (let i = 0; i < 100; i++) {
    if ((await status()) === count) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(await status(), count)
}
try {
  await page.goto(editor + '/projects')
  await page.getByTestId('create-park-demo').click()
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('digital-twin-studio-projects') || '[]').at(-1)?.name === '零碳智慧园区 Demo',
  )
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('digital-twin-studio-projects')).at(-1).id)
  const navigate = path =>
    page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  await navigate('/editor/' + id)
  // The saved scene's data sources reset the settings form once the runtime finishes loading.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true',
  )
  await page.getByTestId('toggle-scene-settings').click()
  // Start from a disabled source so connection counts only reflect the steps below.
  await page.getByTestId('data-source-enabled').uncheck()
  await page.getByTestId('data-source-apply').click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="data-source-status"]').dataset.status === 'unconfigured',
  )
  await waitConnections(0)
  await page.getByTestId('data-source-enabled').check()
  await page.getByTestId('data-source-name').fill('实时设备数据')
  await page.getByTestId('data-source-url').fill(`ws://127.0.0.1:${dataPort}/realtime`)
  await page.getByTestId('data-source-apply').click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="data-source-status"]').dataset.status === 'connected',
  )
  await waitConnections(1)
  await page.getByTestId('history-undo').click()
  await waitConnections(0)
  assert.equal(await page.getByTestId('data-source-enabled').isChecked(), false)
  assert.equal(await page.getByTestId('data-source-status').getAttribute('data-status'), 'unconfigured')
  await page.getByTestId('history-redo').click()
  await waitConnections(1)
  await page.getByTestId('data-source-enabled').uncheck()
  await page.getByTestId('data-source-apply').click()
  await waitConnections(0)
  await page.getByTestId('history-undo').click()
  await waitConnections(1)
  const invalidChecks = await page.evaluate(async () => {
    const { isProjectDataSources } = await Promise.resolve(window.__twinCore)
    const source = { id: 'x', name: 'Test', type: 'websocket', enabled: true, url: 'ws://localhost:8787/realtime' }
    return [
      isProjectDataSources([source]),
      isProjectDataSources([source, { ...source, id: 'y' }]),
      isProjectDataSources([{ ...source, url: 'javascript:alert(1)' }]),
      isProjectDataSources([{ ...source, url: 'ws://user:password@host/' }]),
      isProjectDataSources([{ ...source, token: 'secret' }]),
      isProjectDataSources([]),
    ]
  })
  assert.deepEqual(invalidChecks, [true, false, false, false, false, true])
  await page.getByTestId('save-scene').click()
  await page.waitForFunction(
    id => JSON.parse(localStorage.getItem('digital-twin-studio:scene:v1:' + id)).dataSources?.[0]?.type === 'websocket',
    id,
  )
  await page.waitForFunction(() => !document.querySelector('[data-testid="save-scene"]').textContent.includes('*'))
  const mockBefore = await page.evaluate(async () => {
    const { useTwinStore } = await import('/src/stores/twin.ts')
    return { messages: useTwinStore().dataSourceMessageCount, ticks: useTwinStore().mockTickCount }
  })
  await page.waitForFunction(async count => {
    const { useTwinStore } = await import('/src/stores/twin.ts')
    return useTwinStore().dataSourceMessageCount > count
  }, mockBefore.messages)
  assert.equal(
    await page.evaluate(async () => (await import('/src/stores/twin.ts')).useTwinStore().mockTickCount),
    mockBefore.ticks,
  )
  assert(!(await page.getByTestId('save-scene').textContent()).includes('*'))
  const config = await page.evaluate(
    id => JSON.parse(localStorage.getItem('digital-twin-studio:scene:v1:' + id)).dataSources,
    id,
  )
  await page.reload()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true',
  )
  await page.getByTestId('toggle-scene-settings').click()
  assert.equal(await page.getByTestId('data-source-url').inputValue(), config[0].url)
  await waitConnections(1)
  await navigate('/projects')
  await waitConnections(0)
  await page
    .getByTestId('project-card-' + id)
    .getByTestId('project-menu')
    .click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-project"]:visible').click(),
  ])
  const bytes = await readFile(await download.path())
  await download.saveAs(new URL('../public/project-websocket.twin.zip', import.meta.url).pathname)
  // Parse with the actual project ZIP reader and exercise import through the UI.
  const contents = await page.evaluate(
    async bytes => {
      const { readPackageZip } = await Promise.resolve(window.__twinCore)
      return JSON.parse(new TextDecoder().decode(readPackageZip(new Uint8Array(bytes)).get('scene.json')))
    },
    [...bytes],
  )
  assert.deepEqual(contents.dataSources, config)
  assert.equal(contents.runtimeValues, undefined)
  await page
    .getByTestId('project-package-input')
    .setInputFiles({ name: 'test.twin.zip', mimeType: 'application/zip', buffer: bytes })
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('digital-twin-studio-projects')).at(-1).name.endsWith('（导入）'),
  )
  const imported = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('digital-twin-studio-projects')).at(-1)
    return JSON.parse(localStorage.getItem('digital-twin-studio:scene:v1:' + p.id))
  })
  assert.deepEqual(imported.dataSources, config)
  assert.notEqual(imported.projectId, id)

  await page.goto(dashboard + '/?package=/project-websocket.twin.zip')
  await page.waitForSelector('[data-testid="twin-scene-viewer"][data-loaded="true"]')
  const viewer = fn => page.evaluate(fn)
  await page.evaluate(() => {
    window.sdkViewer = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
  })
  await page.waitForFunction(() => window.sdkViewer.getRuntimeState().dataSourceMessageCount > 0)
  await waitConnections(1)
  assert.equal(await page.getByTestId('source-websocket').count(), 0)
  assert.equal(await viewer(() => window.sdkViewer.getRuntimeState().mockRunning), false)
  await page.getByTestId('device-ESS-003').click()
  await page.waitForFunction(
    () => window.sdkViewer.getRuntimeState().getRuntimeValue('binding-ess-3', 'temperature')?.value === 75,
  )
  await page.waitForFunction(() => window.sdkViewer.getDiagnostics().visualRules.activeRules >= 2)
  assert((await page.locator('.right').textContent()).includes('75.0'))
  await page.screenshot({ path: '/tmp/project-data-source-dashboard.png' })
  const diagnostics = await viewer(() => window.sdkViewer.getDiagnostics())
  assert(diagnostics.effects.helpers > 11)
  // Host API and pointer interaction compatibility.
  await viewer(() => window.sdkViewer.selectDevice('ESS-001'))
  await viewer(() => window.sdkViewer.focusDevice('ESS-001'))
  const canvas = await page.locator('canvas').boundingBox()
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
  await page.waitForSelector('[data-testid="last-interaction-event"]')
  assert.equal(await page.getByTestId('dashboard-demo').getAttribute('data-selected-device-id'), 'ESS-001')
  await page.getByTestId('device-ESS-002').click()
  assert.equal(await viewer(() => window.sdkViewer.getSelection().deviceId), 'ESS-002')
  // Same component, reactive source change: closes old socket; a package without a WebSocket source shows no data.
  await page.evaluate(async () => {
    // Reuse the exact module URLs the app loaded (prebundled tgz or linked workspace dist) to share instances.
    const loaded = performance.getEntriesByType('resource').map(entry => entry.name)
    const { createApp, h, ref } = await import(loaded.find(url => /\/\.vite\/deps\/vue\.js/.test(url)))
    const { TwinSceneViewer } = await import(loaded.find(url => /twin-viewer\.js|@twin-studio_viewer\.js/.test(url)))
    document.querySelector('#app').__vue_app__.unmount()
    window.testSource = ref('/project-websocket.twin.zip')
    window.testApp = createApp({
      render: () =>
        h(TwinSceneViewer, {
          source: window.testSource.value,
          ref: v => {
            window.sdkViewer = v
          },
        }),
    })
    window.testApp.mount('#app')
  })
  await page.waitForFunction(() => window.sdkViewer?.getRuntimeState()?.dataSourceMessageCount > 0)
  await waitConnections(1)
  await page.evaluate(() => {
    window.testSource.value = '/zero-carbon-demo.twin.zip'
  })
  await page.waitForFunction(() => window.sdkViewer?.getRuntimeState()?.dataSourceStatus === 'unconfigured')
  await waitConnections(0)
  await page.waitForTimeout(2500)
  const unconfigured = await viewer(() => {
    const state = window.sdkViewer.getRuntimeState()
    return {
      values: Object.keys(state.runtimeValues).length,
      mock: state.mockRunning,
      ticks: state.mockTickCount,
      rules: window.sdkViewer.getDiagnostics().visualRules.activeRules,
    }
  })
  assert.deepEqual(unconfigured, { values: 0, mock: false, ticks: 0, rules: 0 })
  await page.evaluate(() => {
    window.testSource.value = '/project-websocket.twin.zip'
  })
  await page.waitForFunction(() => window.sdkViewer?.getRuntimeState()?.dataSourceMessageCount > 0)
  await waitConnections(1)
  await page.evaluate(() => window.testApp.unmount())
  await waitConnections(0)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        editorConfigureSaveReload: 'PASS',
        exportImport: 'PASS',
        projectDataSources: config,
        networkTemperature: 75,
        diagnostics,
        selectionFocusEvent: 'PASS',
        legacyPackageNoData: 'PASS',
        sourceSwitchAndDispose: 'PASS',
      },
      null,
      2,
    ),
  )
} finally {
  await context.close()
  await browser.close()
}
