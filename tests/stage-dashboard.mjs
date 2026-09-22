import assert from 'node:assert/strict'

export async function testDashboard(page, projectId) {
  const origin = new URL(page.url()).origin
  const navigate = path => page.evaluate(async path => {
    await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path)
  }, path)
  await page.evaluate(async id => {
    const { useProjectStore } = await import('/src/stores/project.ts')
    const store = useProjectStore()
    if (!store.getProjectById(id)) store.projects.push({ id, name: 'Dashboard 验收项目', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }, projectId)
  await navigate('/projects')
  const card = page.getByTestId(`project-card-${projectId}`)
  await card.waitFor()
  const overlay = card.getByTestId('project-actions-overlay')
  assert.equal(await overlay.evaluate(element => getComputedStyle(element).opacity), '0')
  assert.equal(await card.getAttribute('role'), null)
  await card.locator('h3').click()
  assert.equal(new URL(page.url()).pathname, '/projects')
  await card.hover()
  await page.waitForFunction(id => getComputedStyle(document.querySelector(`[data-testid="project-card-${id}"] [data-testid="project-actions-overlay"]`)).opacity === '1', projectId)
  assert.equal((await card.getByTestId('edit-project').textContent())?.trim(), '编辑项目')
  assert.equal((await card.getByTestId('open-dashboard').textContent())?.trim(), '数据大屏')

  await card.getByTestId('edit-project').click()
  await page.waitForURL(`**/editor/${projectId}`)
  assert.equal(new URL(page.url()).pathname, `/editor/${projectId}`)
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true')
  await navigate('/projects')
  await card.waitFor(); await card.hover(); await card.getByTestId('open-dashboard').click()
  await page.waitForURL(`**/projects/${projectId}/dashboard`)
  assert.equal(new URL(page.url()).pathname, `/projects/${projectId}/dashboard`)
  const dashboard = page.getByTestId('project-dashboard')
  await dashboard.waitFor()
  assert.equal(await dashboard.getAttribute('data-project-id'), projectId)
  assert.equal(await page.getByTestId('dashboard-project-name').textContent(), 'Dashboard 验收项目')
  assert.equal(await page.getByTestId('dashboard-left-panel').count(), 1)
  assert.equal(await page.getByTestId('dashboard-right-panel').count(), 1)
  const dashboardLayout = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="project-dashboard"]')
    const canvas = document.querySelector('[data-testid="twin-scene-viewer"] canvas')
    const left = document.querySelector('[data-testid="dashboard-left-panel"]')
    const right = document.querySelector('[data-testid="dashboard-right-panel"]')
    const rootRect = root.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    return {
      canvasCoverage: [canvasRect.width / rootRect.width, canvasRect.height / rootRect.height],
      leftBackground: getComputedStyle(left).backgroundColor,
      rightBackground: getComputedStyle(right).backgroundColor,
      leftOverlapsCanvas: left.getBoundingClientRect().left >= canvasRect.left && left.getBoundingClientRect().right <= canvasRect.right,
      rightOverlapsCanvas: right.getBoundingClientRect().left >= canvasRect.left && right.getBoundingClientRect().right <= canvasRect.right,
    }
  })
  assert(dashboardLayout.canvasCoverage[0] > 0.99 && dashboardLayout.canvasCoverage[1] > 0.99)
  assert.match(dashboardLayout.leftBackground, /(?:rgba\(.+, 0\.[0-9]+\)|\/ 0\.[0-9]+\))/)
  assert.match(dashboardLayout.rightBackground, /(?:rgba\(.+, 0\.[0-9]+\)|\/ 0\.[0-9]+\))/)
  assert.equal(dashboardLayout.leftOverlapsCanvas, true)
  assert.equal(dashboardLayout.rightOverlapsCanvas, true)
  assert.equal(await page.locator('[data-testid="editor-viewport"], [data-testid="scene-hierarchy"], [data-testid="asset-panel"]').count(), 0)
  await page.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true')
  const viewer = page.getByTestId('twin-scene-viewer')
  assert.equal(await viewer.getAttribute('data-object-count'), '5')
  assert.equal(await viewer.getAttribute('data-binding-count'), '3')
  const runtime = await page.evaluate(() => {
    const api = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
    return { bindings: api.getRuntimeState().bindings.length, rules: Object.keys(api.getRuleDiagnostics().rules).length }
  })
  assert.deepEqual(runtime, { bindings: 3, rules: 5 })
  assert.equal(await page.locator('button[data-testid^="dashboard-device-"]').count(), 3)
  assert.deepEqual((await page.locator('button[data-testid^="dashboard-device-"]').evaluateAll(elements => elements.map(element => element.dataset.testid.replace('dashboard-device-', '')).sort())), ['DOOR-001', 'ESS-001', 'SENSOR-001'])
  assert.equal(await page.getByTestId('dashboard-device-count').textContent(), '3')
  assert.equal(await page.getByTestId('dashboard-resolved-binding-count').textContent(), '3')
  assert.equal((await page.evaluate(async () => {
    const { getMockDataSourceDiagnostics } = await import('/src/infrastructure/data/MockDataSource.ts')
    return getMockDataSourceDiagnostics().activeTimerCount
  })), 1)

  // Host selection uses the same runtime transition as pointer selection.
  const clickedDeviceId = await page.evaluate(projectId => {
    const document = JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${projectId}`))
    const binding = document.bindings.find(item => item.device.id === 'ESS-001')
    const viewer = window.document.querySelector('[data-testid="twin-scene-viewer"]')
    viewer.__vueParentComponent.exposed.selectDevice(binding.device.id)
    return binding.device.id
  }, projectId)
  await page.waitForFunction(id => document.querySelector('[data-testid="project-dashboard"]')?.dataset.selectedDeviceId === id, clickedDeviceId)
  assert.equal(await page.getByTestId('dashboard-selected-device').getAttribute('data-device-id'), 'ESS-001')

  // Deterministic values prove Dashboard and VisualRuleRuntime consume the same runtime state.
  const revisionBefore = Number(await dashboard.getAttribute('data-runtime-revision'))
  await page.evaluate(() => { Math.random = () => 0.9 })
  await page.waitForFunction(() => document.querySelector('[data-testid="dashboard-variable-binding-ESS-001-temperature"]')?.dataset.value === '70')
  const ruleLink = await page.evaluate(() => {
    const api = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
    const diagnostics = api.getRuleDiagnostics().rules
    return { active: Object.values(diagnostics).filter(item => item.status === 'active').length }
  })
  assert.equal(await page.getByTestId('dashboard-variable-binding-ESS-001-soc').getAttribute('data-value'), '82')
  assert.equal(await page.getByTestId('dashboard-variable-binding-ESS-001-power').getAttribute('data-value'), '235')
  assert.equal(await page.getByTestId('dashboard-variable-binding-ESS-001-alarm').getAttribute('data-value'), 'false')
  assert.equal(await page.getByTestId('dashboard-alarm-count').textContent(), '0')
  assert(ruleLink.active > 0)

  const revisionAfterSet = Number(await dashboard.getAttribute('data-runtime-revision'))
  assert(revisionAfterSet > revisionBefore)
  await page.waitForFunction(previous => Number(document.querySelector('[data-testid="project-dashboard"]')?.dataset.runtimeRevision) > previous, revisionAfterSet)

  // Device list selection calls the existing public focusDevice API.
  await page.evaluate(() => {
    const exposed = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
    const focusDevice = exposed.focusDevice
    window.qaDashboardFocusCalls = []
    exposed.focusDevice = async deviceId => { window.qaDashboardFocusCalls.push(deviceId); return focusDevice(deviceId) }
  })
  await page.getByTestId('dashboard-device-DOOR-001').click()
  await page.waitForFunction(() => window.qaDashboardFocusCalls?.includes('DOOR-001'))
  assert.equal(await dashboard.getAttribute('data-selected-device-id'), 'DOOR-001')

  const before = await page.locator('[data-testid="twin-scene-viewer"] canvas').evaluate(canvas => ({ client: [canvas.clientWidth, canvas.clientHeight], buffer: [canvas.width, canvas.height] }))
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.waitForTimeout(250)
  const after = await page.locator('[data-testid="twin-scene-viewer"] canvas').evaluate(canvas => ({ client: [canvas.clientWidth, canvas.clientHeight], buffer: [canvas.width, canvas.height] }))
  assert.notDeepEqual(after.client, before.client)
  assert(Math.abs(after.client[0] / after.client[1] - after.buffer[0] / after.buffer[1]) < 0.02)

  await page.getByTestId('dashboard-edit').click()
  await page.waitForURL(`**/editor/${projectId}`)
  assert.equal(new URL(page.url()).pathname, `/editor/${projectId}`)
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true')
  await navigate(`/projects/${projectId}/dashboard`)
  await page.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true')
  await page.getByTestId('dashboard-back').click()
  await page.waitForURL('**/projects')
  assert.equal(new URL(page.url()).pathname, '/projects')
  await page.waitForTimeout(250)
  const disposed = await page.evaluate(async () => {
    const { getMockDataSourceDiagnostics } = await import('/src/infrastructure/data/MockDataSource.ts')
    const { getVisualRuleDiagnostics } = await import('/src/runtime/effects/VisualRuleRuntime.ts')
    return { ...getMockDataSourceDiagnostics(), ...getVisualRuleDiagnostics(), ...window.qaResources() }
  })
  assert.deepEqual(disposed, { activeTimerCount: 0, subscriptions: 0, urls: 0, raf: 0 })

  const secondId = `${projectId}-dashboard-2`
  await page.evaluate(({ sourceId, secondId }) => {
    const prefix = 'digital-twin-studio:scene:v1:'
    const doc = JSON.parse(localStorage.getItem(prefix + sourceId)); doc.projectId = secondId; doc.metadata.name = '第二个大屏项目'
    const binding = doc.bindings.find(item => item.device.id === 'ESS-001')
    binding.id = 'binding-PROJECT-2'; binding.device = { id: 'PROJECT-2', name: '二号项目设备', type: 'test-device' }
    doc.bindings = [binding]; doc.visualRules = []; doc.effects = []
    localStorage.setItem(prefix + secondId, JSON.stringify(doc))
  }, { sourceId: projectId, secondId })
  await page.evaluate(async id => {
    const { useProjectStore } = await import('/src/stores/project.ts'); const store = useProjectStore()
    store.projects.push({ id, name: '第二个大屏项目', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }, secondId)
  await navigate(`/projects/${secondId}/dashboard`)
  await page.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true')
  assert.equal(await dashboard.getAttribute('data-project-id'), secondId)
  assert.equal(await page.getByTestId('dashboard-project-name').textContent(), '第二个大屏项目')
  assert.equal(await dashboard.getAttribute('data-device-count'), '1')
  assert.equal(await page.getByTestId('dashboard-device-PROJECT-2').count(), 1)
  assert.equal(await page.getByTestId('dashboard-device-ESS-001').count(), 0)
  assert.equal(await page.locator('[data-testid="twin-scene-viewer"] canvas').count(), 1)
  await page.screenshot({ path: '/tmp/twin-dashboard.png' })
  await navigate('/projects'); await page.waitForTimeout(250)
  assert.deepEqual(await page.evaluate(() => window.qaResources()), { urls: 0, raf: 0 })
  assert.equal(new URL(`${origin}/dev/viewer?projectId=${projectId}`).pathname, '/dev/viewer')
  return { cardOverlay: 'PASS', routes: 'PASS', fullScreenViewer: dashboardLayout, viewerRuntime: runtime, devices: 'PASS', viewerToDashboard: 'PASS', dashboardToViewer: 'PASS', sharedRuntimeValues: 'PASS', visualRules: ruleLink, resize: 'PASS', navigation: 'PASS', dispose: disposed, projectIsolation: 'PASS', devViewerRetained: 'PASS' }
}
