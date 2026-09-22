import assert from 'node:assert/strict'

export async function testViewerContract(page, sourceId) {
  const id = `${sourceId}-contract`
  const navigate = path => page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  const ready = () => page.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true')
  await page.evaluate(({ sourceId, id }) => {
    const prefix = 'digital-twin-studio:scene:v1:'
    const doc = JSON.parse(localStorage.getItem(prefix + sourceId))
    doc.projectId = id; doc.effects = []; doc.visualRules = []
    const rootBinding = doc.bindings.find(b => b.device.id === 'ESS-001')
    rootBinding.target = { type: 'asset-instance', instanceId: doc.instances[0].instanceId }
    doc.bindings = [rootBinding, { ...structuredClone(rootBinding), id: 'binding-ESS-002',
      device: { id: 'ESS-002', name: 'Second cabinet' }, target: { type: 'asset-instance', instanceId: doc.instances[1].instanceId } }]
    doc.instances[0].transform.position = [-10, 0, 0]
    doc.instances[1].transform.position = [10, 0, 0]
    doc.primitives.forEach((p, i) => { p.transform.position = [0, 0, 15 + i * 15] })
    localStorage.setItem(prefix + id, JSON.stringify(doc))
  }, { sourceId, id })
  await navigate(`/projects/${id}/dashboard`); await ready()
  await page.evaluate(() => {
    const component = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent
    window.contractEvents = []
    const emit = component.emit
    component.emit = (name, ...args) => { if (name === 'selection-change') window.contractEvents.push(args[0]); emit(name, ...args) }
    window.contractApi = component.exposed
  })
  assert.equal(await page.evaluate(() => window.contractApi.getSelection()), null)
  // Focus without selection, then a real pointer click in the focused object.
  assert(await page.evaluate(() => window.contractApi.focusDevice('ESS-001')))
  assert.equal(await page.evaluate(() => window.contractApi.getSelection()), null)
  const center = await page.locator('[data-testid="twin-scene-viewer"] canvas').boundingBox()
  await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2)
  await page.waitForFunction(() => window.contractApi.getSelection()?.deviceId === 'ESS-001')
  assert.equal(await page.getByTestId('project-dashboard').getAttribute('data-selected-device-id'), 'ESS-001')
  const first = await page.evaluate(() => window.contractApi.getSelection())
  assert.equal(first.bindingTarget.type, 'asset-instance')
  const count = await page.evaluate(() => window.contractEvents.length)
  await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2)
  await page.waitForTimeout(300)
  await page.evaluate(() => window.contractApi.selectTarget(window.contractApi.getSelection().target))
  assert.equal(await page.evaluate(() => window.contractEvents.length), count)
  await page.getByTestId('dashboard-device-ESS-002').click()
  await page.waitForFunction(() => window.contractApi.getSelection()?.deviceId === 'ESS-002')
  assert(await page.evaluate(() => window.contractApi.focusDevice('ESS-002')))
  assert.equal(await page.getByTestId('project-dashboard').getAttribute('data-selected-device-id'), 'ESS-002')
  const stable = await page.evaluate(() => {
    const api = window.contractApi, before = window.contractEvents.length
    for (let i = 0; i < 10; i++) api.selectDevice('ESS-002')
    return { before, after: window.contractEvents.length, missing: api.selectDevice('missing'), selection: api.getSelection() }
  })
  assert.equal(stable.before, stable.after); assert.equal(stable.missing, false)
  assert.equal(await page.evaluate(() => window.contractApi.focusDevice('missing')), false)
  assert.equal(await page.evaluate(() => window.contractApi.selectTarget({ type: 'primitive', nodeId: 'missing' })), false)
  // An unbound primitive must select a target without a device.
  const target = await page.evaluate(id => {
    const doc = JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`))
    return { type: 'primitive', nodeId: doc.primitives.find(p => p.primitiveType === 'box' || p.name === 'Box').nodeId }
  }, id)
  assert(await page.evaluate(target => window.contractApi.focusTarget(target), target))
  await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2)
  await page.waitForFunction(target => JSON.stringify(window.contractApi.getSelection()?.target) === JSON.stringify(target), target)
  assert.equal(await page.evaluate(() => window.contractApi.getSelection().deviceId), null)
  assert.equal(await page.getByTestId('project-dashboard').getAttribute('data-selected-device-id'), '')
  // The focused box occupies most of the canvas; this gap is outside both panels and its bounds.
  await page.mouse.click(290, 100)
  await page.waitForFunction(() => window.contractApi.getSelection() === null)
  const emptyCount = await page.evaluate(() => window.contractEvents.length)
  await page.evaluate(() => { window.contractApi.clearSelection(); window.contractApi.clearSelection() })
  assert.equal(await page.evaluate(() => window.contractEvents.length), emptyCount)
  // Verify the facade is stable, live, deeply readonly, and has no mutation methods.
  const boundary = await page.evaluate(async () => {
    const { isReadonly } = await import('/node_modules/.vite/deps/vue.js')
    const state = window.contractApi.getRuntimeState()
    const binding = state.bindings[0], value = state.getRuntimeValue(binding.id, binding.variables[0].key)
    return { stable: state === window.contractApi.getRuntimeState(), readonly: isReadonly(state),
      bindings: isReadonly(state.bindings) && isReadonly(binding), value: isReadonly(value),
      methods: Object.keys(state).filter(key => typeof state[key] === 'function') }
  })
  assert.deepEqual(boundary, { stable: true, readonly: true, bindings: true, value: true, methods: ['getRuntimeValue'] })
  // Switch project on the same Viewer component (development host has no :key).
  await navigate(`/dev/viewer?projectId=${id}`); await ready()
  await page.evaluate(() => {
    const component = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent
    window.switchEvents = []; const emit = component.emit
    component.emit = (name, ...args) => { if (name === 'selection-change') window.switchEvents.push(args[0]); emit(name, ...args) }
    component.exposed.selectDevice('ESS-001')
    window.oldState = component.exposed.getRuntimeState()
  })
  await navigate(`/dev/viewer?projectId=${sourceId}`); await ready()
  assert.deepEqual(await page.evaluate(() => ({ empty: document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed.getSelection(),
    cleared: window.switchEvents.at(-1), oldProject: window.oldState.projectId })), { empty: null, cleared: null, oldProject: null })
  for (let i = 0; i < 3; i++) {
    await navigate(`/projects/${id}/dashboard`); await ready()
    await page.evaluate(() => {
      window.disposedApi = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
      window.disposedApi.selectDevice('ESS-001')
    })
    await navigate('/projects'); await page.waitForTimeout(150)
    const result = await page.evaluate(async () => {
      const { getMockDataSourceDiagnostics } = await import('/src/infrastructure/data/MockDataSource.ts')
      return { selection: window.disposedApi.getSelection(), select: window.disposedApi.selectDevice('ESS-001'),
        focus: await window.disposedApi.focusDevice('ESS-001'), listeners: window.qaPointerListeners(),
        timers: getMockDataSourceDiagnostics().activeTimerCount, ...window.qaResources() }
    })
    assert.deepEqual(result, { selection: null, select: false, focus: false, listeners: 0, timers: 0, urls: 0, raf: 0 })
  }
  return { realBoundClick: 'PASS', realUnboundClick: 'PASS', realBlankClick: 'PASS', hostSelectFocus: 'PASS',
    idempotency: 'PASS', readOnlyBoundary: boundary, projectSwitch: 'PASS', lifecycle: 'PASS: three cycles' }
}
