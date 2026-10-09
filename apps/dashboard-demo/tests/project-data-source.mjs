// Dashboard suite: the delivery path. The editor exports the sample park pointed at the simulator; the
// dashboard demo loads it through the built Viewer SDK exactly like an external host, then exercises live
// data, alarms, two-way selection, tours, views, layers and the connection lifecycle.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createDemo, launch, save, setDataSource } from '../../editor/tests/helpers.mjs'

const editor = process.env.EDITOR_URL || 'http://127.0.0.1:5173'
const dashboard = process.env.TEST_BASE_URL || 'http://127.0.0.1:5200'
const dataPort = process.env.TWIN_DATA_PORT || '8787'
const { page, errors, close } = await launch()
const report = {}
const connections = async () => (await (await fetch(`http://127.0.0.1:${dataPort}/status`)).json()).connections
const waitConnections = async count => {
  for (let i = 0; i < 100 && (await connections()) !== count; i++) await new Promise(r => setTimeout(r, 100))
  assert.equal(await connections(), count)
}
const sdk = fn => page.evaluate(fn)

try {
  // ---------------------------------------------------------------- editor: export
  const projectId = await createDemo(page, editor)
  await setDataSource(page, dataPort)
  await save(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-package').click()])
  const bytes = await readFile(await download.path())
  await writeFile(new URL('../public/e2e-project.twin.zip', import.meta.url), bytes)
  // The same package stamped as a future format, for the SDK's upgrade message.
  const newer = await page.evaluate(
    async bytes => {
      const core = window.__twinCore
      const files = core.readPackageZip(new Uint8Array(bytes))
      const scene = JSON.parse(new TextDecoder().decode(files.get('scene.json')))
      scene.version = core.SCENE_DOCUMENT_VERSION + 1
      const sceneBytes = new TextEncoder().encode(JSON.stringify(scene))
      const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')))
      manifest.scene.sha256 = await core.sha256(sceneBytes)
      files.set('scene.json', sceneBytes)
      files.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)))
      const zip = await core.writePackageZip(Object.fromEntries(files))
      return [...new Uint8Array(await zip.arrayBuffer())]
    },
    [...bytes],
  )
  await writeFile(new URL('../public/e2e-newer.twin.zip', import.meta.url), Buffer.from(newer))
  const scene = await page.evaluate(
    async bytes => {
      const files = window.__twinCore.readPackageZip(new Uint8Array(bytes))
      return JSON.parse(new TextDecoder().decode(files.get('scene.json')))
    },
    [...bytes],
  )
  assert.equal(scene.version, 2)
  assert.equal(scene.dataSources[0].url, `ws://127.0.0.1:${dataPort}/realtime`)
  report.exportPackage = 'PASS'

  // ---------------------------------------------------------------- editor: import
  await page.goto(`${editor}/projects`)
  await page
    .getByTestId('project-package-input')
    .setInputFiles({ name: 'park.twin.zip', mimeType: 'application/zip', buffer: bytes })
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('digital-twin-studio-projects')).at(-1).name.endsWith('（导入）'),
  )
  const imported = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('digital-twin-studio-projects')).at(-1)
    return JSON.parse(localStorage.getItem('digital-twin-studio:scene:v1:' + project.id))
  })
  assert.notEqual(imported.projectId, projectId)
  assert.equal(imported.nodes.length, scene.nodes.length)
  report.importPackage = 'PASS'

  // ---------------------------------------------------------------- dashboard: newer format
  await page.goto(`${dashboard}/?package=/e2e-newer.twin.zip`)
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="twin-scene-viewer"]')?.textContent.includes('请升级 Viewer SDK'),
  )
  report.newerFormatMessage = (await page.getByTestId('twin-scene-viewer').textContent()).trim()

  // ---------------------------------------------------------------- dashboard: live project
  await page.goto(`${dashboard}/?package=/e2e-project.twin.zip`)
  await page.waitForSelector('[data-testid="twin-scene-viewer"][data-loaded="true"]', { timeout: 60000 })
  await page.evaluate(() => {
    window.sdkViewer = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
  })
  await page.waitForFunction(() => window.sdkViewer.getRuntimeState().dataSourceMessageCount > 0)
  await waitConnections(1)
  await page.getByTestId('device-ESS-003').click()
  assert.equal(await sdk(() => window.sdkViewer.getSelection().deviceId), 'ESS-003')
  await page.waitForFunction(
    () => window.sdkViewer.getRuntimeState().getRuntimeValue('binding-ess-3', 'temperature')?.value === 75,
    null,
    { timeout: 30000 },
  )
  await page.waitForFunction(() => window.sdkViewer.getAlarms().length > 0)
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="alarm-list"]').dataset.count) > 0)
  report.liveDataAndAlarms = 'PASS'

  // Scene → dashboard: clicking a device in 3D selects it and emits the configured business event.
  await sdk(() => window.sdkViewer.selectDevice('ESS-001'))
  await sdk(() => window.sdkViewer.focusDevice('ESS-001'))
  const canvas = await page.locator('canvas').boundingBox()
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
  await page.waitForSelector('[data-testid="last-interaction-event"]')
  assert.equal(await page.getByTestId('dashboard-demo').getAttribute('data-selected-device-id'), 'ESS-001')
  // Dashboard → scene.
  await page.getByTestId('device-ESS-002').click()
  assert.equal(await sdk(() => window.sdkViewer.getSelection().deviceId), 'ESS-002')
  report.twoWaySelection = 'PASS'

  // SDK 0.4.0: tours, views, layers, performance.
  assert.equal(await sdk(() => window.sdkViewer.getTours().length), 1)
  await page.getByTestId('tour-toggle').click()
  await page.waitForSelector('[data-testid="tour-caption"]')
  assert.equal(await sdk(() => window.sdkViewer.getTourState().playing), true)
  await page.getByTestId('tour-toggle').click()
  await page.waitForFunction(() => !window.sdkViewer.getTourState().playing)
  assert.equal(await sdk(() => window.sdkViewer.getBookmarks().length), 5)
  assert.equal(await sdk(async () => window.sdkViewer.flyToBookmark(window.sdkViewer.getBookmarks()[2].id, 0.2)), true)
  await page.getByTestId('layer-储能区').click()
  const layer = await sdk(() => window.sdkViewer.getNodes().find(node => node.name === '储能区'))
  assert.equal(layer.visible, false)
  await page.getByTestId('layer-储能区').click()
  assert.equal(await sdk(() => window.sdkViewer.getNodes().find(node => node.name === '储能区').visible), true)
  await page.waitForFunction(() => window.sdkViewer.getPerformance().fps > 0)
  report.toursViewsLayers = 'PASS'

  // Source switch and dispose: a package without a WebSocket source shows no data at all.
  await page.evaluate(async () => {
    const loaded = performance.getEntriesByType('resource').map(entry => entry.name)
    const { createApp, h, ref } = await import(loaded.find(url => /\/\.vite\/deps\/vue\.js/.test(url)))
    const { TwinSceneViewer } = await import(loaded.find(url => /twin-viewer\.js|@twin-studio_viewer\.js/.test(url)))
    document.querySelector('#app').__vue_app__.unmount()
    window.testSource = ref('/e2e-project.twin.zip')
    window.testApp = createApp({
      render: () => h(TwinSceneViewer, { source: window.testSource.value, ref: v => (window.sdkViewer = v) }),
    })
    window.testApp.mount('#app')
  })
  await page.waitForFunction(() => window.sdkViewer?.getRuntimeState()?.dataSourceMessageCount > 0, null, {
    timeout: 60000,
  })
  await waitConnections(1)
  await page.evaluate(() => (window.testSource.value = '/zero-carbon-demo.twin.zip'))
  await page.waitForFunction(() => window.sdkViewer?.getRuntimeState()?.dataSourceStatus === 'unconfigured', null, {
    timeout: 60000,
  })
  await waitConnections(0)
  await page.waitForTimeout(1500)
  assert.equal(await sdk(() => Object.keys(window.sdkViewer.getRuntimeState().runtimeValues).length), 0)
  await page.evaluate(() => window.testApp.unmount())
  await waitConnections(0)
  report.legacyPackageAndDispose = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
