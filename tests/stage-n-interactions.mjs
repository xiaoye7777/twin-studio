import assert from 'node:assert/strict'

export async function testInteractions(page, sourceId) {
  const id = `${sourceId}-interactions`
  const key = value => `digital-twin-studio:scene:v1:${value}`
  const navigate = path => page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  const editorReady = () => page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true')
  const viewerReady = () => page.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true')

  await page.evaluate(({ sourceId, id }) => {
    const prefix = 'digital-twin-studio:scene:v1:'
    const doc = JSON.parse(localStorage.getItem(prefix + sourceId))
    doc.projectId = id
    doc.effects = []
    doc.visualRules = []
    doc.interactions = []
    doc.instances[0].transform.position = [0, 0, 0]
    doc.instances[1].transform.position = [10, 0, 0]
    doc.primitives.forEach((item, index) => { item.transform.position = [0, 0, 20 + index * 10] })
    localStorage.setItem(prefix + id, JSON.stringify(doc))
  }, { sourceId, id })

  await navigate(`/editor/${id}`)
  await editorReady()
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/stores/editor.ts')
    const editor = useEditorStore()
    editor.selectObject(editor.sceneRoots.find(root => root.userData.editor?.kind === 'assetInstance'))
  })
  await page.getByTestId('add-interaction').click()
  await page.getByTestId('interaction-trigger').selectOption('click')
  await page.getByTestId('interaction-action').selectOption('emit-event')
  await page.getByTestId('interaction-event-name').fill('open-device-detail')
  await page.getByTestId('interaction-metadata').fill('{"panel":"device"}')
  await page.getByTestId('save-interaction').click()
  await page.waitForFunction(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions.length === 1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.waitForFunction(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions.length === 0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.waitForFunction(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions.length === 1)

  await page.getByTestId('edit-interaction').click()
  await page.getByTestId('interaction-event-name').fill('open-device-detail-updated')
  await page.getByTestId('save-interaction').click()
  assert.equal(await page.evaluate(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions[0].action.eventName), 'open-device-detail-updated')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  assert.equal(await page.evaluate(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions[0].action.eventName), 'open-device-detail')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.getByTestId('toggle-interaction').click()
  assert.equal(await page.evaluate(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions[0].enabled), false)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByTestId('delete-interaction').click()
  assert.equal(await page.evaluate(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions.length), 0)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  assert.equal(await page.evaluate(async () => (await import('/src/stores/interactions.ts')).useInteractionsStore().interactions.length), 1)

  await page.getByRole('button', { name: '保存 *', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.sceneDirty === 'false')
  let saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)), id)
  assert.equal(saved.interactions.length, 1)
  await page.reload()
  await editorReady()
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/stores/editor.ts')
    const editor = useEditorStore()
    editor.selectObject(editor.sceneRoots.find(root => root.userData.editor?.kind === 'assetInstance'))
  })
  assert.equal(await page.locator('[data-interaction-id]').count(), 1)

  saved = await page.evaluate(id => {
    const prefix = 'digital-twin-studio:scene:v1:'
    const doc = JSON.parse(localStorage.getItem(prefix + id))
    const source = { type: 'asset-instance', instanceId: doc.instances[0].instanceId }
    const second = { type: 'asset-instance', instanceId: doc.instances[1].instanceId }
    doc.interactions.push(
      { id: 'n-hide', enabled: true, source, trigger: 'click', action: { type: 'hide', target: second } },
      { id: 'n-highlight', enabled: true, source, trigger: 'hover-enter', action: { type: 'highlight' } },
      { id: 'n-show', enabled: true, source, trigger: 'hover-leave', action: { type: 'show', target: second } },
      { id: 'n-focus', enabled: true, source, trigger: 'double-click', action: { type: 'focus' } },
      { id: 'n-double-event', enabled: true, source, trigger: 'double-click', action: { type: 'emit-event', eventName: 'double-focus', metadata: { source: 'qa' } } },
      { id: 'n-missing', enabled: true, source: { type: 'primitive', nodeId: 'missing-node' }, trigger: 'click', action: { type: 'select' } },
    )
    localStorage.setItem(prefix + id, JSON.stringify(doc))
    return doc
  }, id)

  await navigate(`/dev/viewer?projectId=${id}`)
  await viewerReady()
  await page.evaluate(() => {
    const component = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent
    window.interactionApi = component.exposed
    window.interactionEvents = []
    const emit = component.emit
    component.emit = (name, ...args) => { if (name === 'interaction-event') window.interactionEvents.push(args[0]); emit(name, ...args) }
  })
  const source = { type: 'asset-instance', instanceId: saved.instances[0].instanceId }
  const second = { type: 'asset-instance', instanceId: saved.instances[1].instanceId }
  assert(await page.evaluate(target => window.interactionApi.focusTarget(target), source))
  const rect = await page.locator('[data-testid="twin-scene-viewer"] canvas').boundingBox()
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }

  await page.mouse.move(center.x, center.y)
  await page.waitForFunction(() => window.interactionApi.getInteractionDiagnostics()?.hoverTarget !== null)
  assert.equal(await page.evaluate(() => window.interactionApi.getEffectDiagnostics().transientOwners), 1)
  await page.mouse.click(center.x, center.y)
  await page.waitForFunction(() => window.interactionEvents.some(event => event.eventName === 'open-device-detail-updated'))
  assert.equal(await page.evaluate(target => window.interactionApi.getRuntimeObject(target).visible, second), false)
  const businessEvent = await page.evaluate(() => window.interactionEvents.find(event => event.eventName === 'open-device-detail-updated'))
  assert.equal(businessEvent.deviceId, 'ESS-001')
  assert.equal(businessEvent.metadata.panel, 'device')
  assert(!JSON.stringify(businessEvent).includes('uuid'))
  assert(!JSON.stringify(businessEvent).includes('bid'))

  await page.mouse.move(300, 100)
  await page.waitForFunction(target => window.interactionApi.getRuntimeObject(target).visible === true, second)
  assert.equal(await page.evaluate(() => window.interactionApi.getEffectDiagnostics().transientOwners), 0)
  await page.mouse.move(center.x, center.y)
  await page.waitForTimeout(50)
  await page.evaluate(() => { window.interactionEvents = [] })
  await page.mouse.dblclick(center.x, center.y, { delay: 40 })
  await page.waitForFunction(() => window.interactionEvents.some(event => event.eventName === 'double-focus'))
  await page.waitForTimeout(350)
  const arbitration = await page.evaluate(() => window.interactionEvents.map(event => ({ name: event.eventName, trigger: event.trigger })))
  assert.deepEqual(arbitration, [{ name: 'double-focus', trigger: 'double-click' }])

  const diagnostics = await page.evaluate(() => window.interactionApi.getInteractionDiagnostics())
  assert.equal(diagnostics.total, 7)
  assert.equal(diagnostics.enabled, 7)
  assert(diagnostics.unresolved.includes('n-missing'))
  assert.equal(diagnostics.pointerActive, true)
  assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)), id), saved)

  await navigate('/projects')
  await page.waitForTimeout(200)
  const disposed = await page.evaluate(async () => {
    const { getEffectDiagnostics } = await import('/src/runtime/effects/EffectRuntime.ts')
    const { getMockDataSourceDiagnostics } = await import('/src/infrastructure/data/MockDataSource.ts')
    return { listeners: window.qaPointerListeners(), effects: getEffectDiagnostics().activeLoops, timers: getMockDataSourceDiagnostics().activeTimerCount }
  })
  assert.deepEqual(disposed, { listeners: 0, effects: 0, timers: 0 })
  return {
    editorHistory: 'PASS: add/edit/toggle/delete with grouped History', persistence: 'PASS',
    singleDoubleArbitration: 'PASS', hoverHighlight: 'PASS', runtimeVisibility: 'PASS',
    businessEvent: 'PASS: stable JSON payload', diagnostics, lifecycle: 'PASS',
  }
}
