import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

export async function testProjectPackage(page, sourceId) {
  const original = await page.evaluate(async id => {
    const { useProjectStore } = await import('/src/stores/project.ts')
    const doc = JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`))
    const source = { type: 'asset-instance', instanceId: doc.instances[0].instanceId }
    doc.interactions = [
      { id: 'package-focus', source, enabled: true, trigger: 'double-click', action: { type: 'focus' } },
      { id: 'package-event', source, enabled: true, trigger: 'click', action: { type: 'emit-event', eventName: 'open-device-detail', metadata: { panel: 'device' } } },
      { id: 'package-hover', source, enabled: true, trigger: 'hover-enter', action: { type: 'highlight' } },
    ]
    doc.visualRules[0].condition = { dataType: 'number', operator: '>', value: 0 }
    doc.visualRules[0].priority = 100
    localStorage.setItem(`digital-twin-studio:scene:v1:${id}`, JSON.stringify(doc))
    const store = useProjectStore()
    if (!store.getProjectById(id)) store.addImportedProject({ id, name: 'Package 园区', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    else store.getProjectById(id).name = 'Package 园区'
    const { IndexedDbAssetRepository } = await import('/src/infrastructure/assets/index.ts')
    const repo = new IndexedDbAssetRepository(), model = await repo.get(doc.instances[0].assetId)
    await repo.saveFile(new File([model.blob], 'unreferenced.glb', { type: 'model/gltf-binary' }))
    return doc
  }, sourceId)
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/projects'))
  const card = page.getByTestId(`project-card-${sourceId}`)
  await card.getByTestId('project-menu').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-project"]:visible').click(),
  ])
  assert(download.suggestedFilename().endsWith('.twin.zip'))
  const buffer = await readFile(await download.path())
  assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)), sourceId), original)

  // An independent browser context has neither the source project nor its IndexedDB.
  const clean = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } })
  const fresh = await clean.newPage()
  const errors = []
  fresh.on('pageerror', error => errors.push(error.message))
  const base = new URL(page.url()).origin
  const navigate = path => fresh.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  try {
    await fresh.goto(`${base}/projects`)
    const before = await fresh.evaluate(async () => {
      const { IndexedDbAssetRepository } = await import('/src/infrastructure/assets/index.ts')
      return (await new IndexedDbAssetRepository().listMetadata()).length
    })
    assert.equal(before, 0)
    const file = { name: 'project.twin.zip', mimeType: 'application/zip', buffer }
    await fresh.getByTestId('project-package-input').setInputFiles(file)
    await fresh.waitForFunction(() => JSON.parse(localStorage.getItem('digital-twin-studio-projects') ?? '[]').some(p => p.name === 'Package 园区（导入）'))
    const imported = await fresh.evaluate(() => JSON.parse(localStorage.getItem('digital-twin-studio-projects')).find(p => p.name === 'Package 园区（导入）'))
    const result = await fresh.evaluate(async id => {
      const { IndexedDbAssetRepository } = await import('/src/infrastructure/assets/index.ts')
      const doc = JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`))
      const assets = await new IndexedDbAssetRepository().listMetadata()
      return { doc, assets, templates: localStorage.getItem('digital-twin-studio:effect-templates:v1') }
    }, imported.id)
    assert.notEqual(imported.id, sourceId)
    assert.equal(result.assets.length, 2)
    assert.equal(result.templates, null)
    const normalized = structuredClone(result.doc)
    normalized.projectId = original.projectId
    normalized.instances.forEach((instance, index) => { assert.notEqual(instance.assetId, original.instances[index].assetId); instance.assetId = original.instances[index].assetId })
    normalized.sceneSettings.environmentAssetId = original.sceneSettings.environmentAssetId
    assert.deepEqual(normalized, original)
    assert.equal(result.doc.instances[0].assetId, result.doc.instances[1].assetId)

    await fresh.getByTestId(`project-card-${imported.id}`).getByTestId('edit-project').click()
    await fresh.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true')
    const restored = await fresh.evaluate(async () => {
      const { useEditorStore } = await import('/src/stores/editor.ts')
      const { useVisualRulesStore } = await import('/src/stores/visualRules.ts')
      const { useInteractionsStore } = await import('/src/stores/interactions.ts')
      const editor = useEditorStore(), a = editor.sceneRoots.find(o => o.name === 'Cabinet A')
      return { roots: editor.sceneRoots.length, override: a.getObjectByName('Door override').position.x,
        deleted: !a.getObjectByName('RemovablePanel'), dirty: editor.isDirty,
        interactions: useInteractionsStore().interactions.length, rules: useVisualRulesStore().rules.length }
    })
    assert.equal(restored.roots, original.instances.length + original.primitives.length)
    assert.equal(restored.override, 0.25); assert(restored.deleted); assert.equal(restored.dirty, false)
    assert.equal(restored.interactions, 3)
    assert.equal(await fresh.getByTestId('editor-viewport').getAttribute('data-environment-status'), 'test.hdr')
    // The imported rule remains editable from its embedded recipe, with no user template library.
    await fresh.evaluate(async () => {
      const { useEditorStore } = await import('/src/stores/editor.ts')
      const editor = useEditorStore()
      editor.selectObject(editor.sceneRoots.find(o => o.name === 'Cabinet A'))
    })
    await fresh.getByTestId('edit-visual-rule').first().click()
    assert.equal(await fresh.getByTestId('rule-template').inputValue(), '@snapshot')
    await fresh.getByRole('button', { name: '取消', exact: true }).click()
    await navigate(`/projects/${imported.id}/dashboard`)
    await fresh.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true')
    await fresh.evaluate(() => {
      const component = document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent
      window.packageApi = component.exposed; window.packageEvents = []
      const emit = component.emit
      component.emit = (name, ...args) => { if (name === 'interaction-event') window.packageEvents.push(args[0]); emit(name, ...args) }
    })
    await fresh.waitForFunction(() => window.packageApi.getRuleDiagnostics().activeRules > 0)
    const viewer = await fresh.evaluate(doc => {
      const api = window.packageApi
      const objects = [...doc.instances.map(i => api.getRuntimeObject({ type: 'asset-instance', instanceId: i.instanceId })), ...doc.primitives.map(p => api.getRuntimeObject({ type: 'primitive', nodeId: p.nodeId }))]
      return { transforms: objects.map(o => ({ position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray(), visible: o.visible })),
        independent: objects[0] !== objects[1], environment: !!objects[0].parent.environment,
        bindings: api.getRuntimeState().bindings.length, running: api.getRuntimeState().mockRunning,
        interactions: api.getInteractionDiagnostics().total, effects: api.getEffectDiagnostics().effects }
    }, original)
    assert(viewer.independent && viewer.environment && viewer.running)
    assert.equal(viewer.bindings, original.bindings.length); assert.equal(viewer.interactions, 3)
    assert(viewer.effects >= original.effects.length)
    for (const [index, item] of [...original.instances, ...original.primitives].entries()) assert.deepEqual(viewer.transforms[index], { ...item.transform, visible: item.visible ?? true })
    assert(await fresh.evaluate(() => window.packageApi.focusDevice('ESS-001')))
    const rect = await fresh.locator('[data-testid="twin-scene-viewer"] canvas').boundingBox()
    await fresh.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await fresh.waitForFunction(() => window.packageApi.getEffectDiagnostics().transientOwners === 1)
    await fresh.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await fresh.waitForFunction(() => window.packageEvents.length === 1)
    assert.equal(await fresh.evaluate(() => window.packageEvents[0].eventName), 'open-device-detail')
    assert(await fresh.evaluate(() => !!window.packageApi.getSelection()?.target))
    await fresh.mouse.dblclick(rect.x + rect.width / 2, rect.y + rect.height / 2, { delay: 40 })
    await fresh.waitForTimeout(500)
    assert.equal(await fresh.evaluate(() => window.packageEvents.length), 1)
    await navigate('/projects')
    const view = await fresh.evaluate(async id => {
      const { TwinSceneRuntime } = await import('/src/runtime/twin/TwinSceneRuntime.ts')
      const { LocalSceneRepository } = await import('/src/infrastructure/scenes/index.ts')
      const { IndexedDbAssetRepository } = await import('/src/infrastructure/assets/index.ts')
      const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:640px;height:480px'; document.body.append(canvas)
      const runtime = new TwinSceneRuntime(canvas, new LocalSceneRepository(), new IndexedDbAssetRepository(), () => {})
      try {
        const warnings = await runtime.load(id)
        const camera = runtime.meteor.getCamera(), scene = runtime.meteor.getScene()
        return { warnings, camera: runtime.meteor.getView(), fov: camera.fov,
          ambient: scene.getObjectByName('Editor Ambient Light').intensity,
          directional: scene.getObjectByName('Editor Directional Light').intensity,
          ground: scene.getObjectByName('Editor Ground').material.color.getHexString() }
      } finally { runtime.dispose(); canvas.remove() }
    }, imported.id)
    assert.deepEqual(view.warnings, [])
    assert.equal(view.ambient, original.sceneSettings.lighting.ambientIntensity)
    assert.equal(view.directional, original.sceneSettings.lighting.directionalIntensity)
    assert.equal(view.ground, original.sceneSettings.ground.color.slice(1))
    assert.equal(view.fov, original.cameraView.fov)
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      assert(Math.abs(view.camera.position[axis] - original.cameraView.position[i]) < 1e-6)
      assert(Math.abs(view.camera.target[axis] - original.cameraView.target[i]) < 1e-6)
    }
    await fresh.getByTestId('project-package-input').setInputFiles(file)
    await fresh.waitForFunction(() => JSON.parse(localStorage.getItem('digital-twin-studio-projects')).filter(p => p.name === 'Package 园区（导入）').length === 2)
    const copies = await fresh.evaluate(() => JSON.parse(localStorage.getItem('digital-twin-studio-projects')).filter(p => p.name === 'Package 园区（导入）').map(p => JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${p.id}`))))
    assert.notEqual(copies[0].projectId, copies[1].projectId)
    assert.notEqual(copies[0].instances[0].assetId, copies[1].instances[0].assetId)
    assert.deepEqual(copies[0], result.doc)

    const robustness = await fresh.evaluate(async bytes => {
      const { unzipSync, zipSync } = await import('/node_modules/fflate/esm/browser.js')
      const { ProjectPackageService } = await import('/src/infrastructure/packages/ProjectPackageService.ts')
      const { IndexedDbAssetRepository } = await import('/src/infrastructure/assets/index.ts')
      const { LocalSceneRepository } = await import('/src/infrastructure/scenes/index.ts')
      const { useProjectStore } = await import('/src/stores/project.ts')
      const { sha256 } = await import('/src/infrastructure/packages/packageFormat.ts')
      const projects = useProjectStore(), assets = new IndexedDbAssetRepository(), scenes = new LocalSceneRepository()
      const service = new ProjectPackageService(scenes, assets, projects)
      const input = new Uint8Array(bytes), originalFiles = unzipSync(input)
      const encode = value => new TextEncoder().encode(JSON.stringify(value))
      const snapshot = async () => JSON.stringify({ projects: projects.projects, assets: await assets.listMetadata(), scenes: Object.keys(localStorage).filter(k => k.startsWith('digital-twin-studio:scene:')).sort() })
      const before = await snapshot(), rejected = []
      async function reject(name, data, importer = service) {
        let message = ''
        try { await importer.importProject(new Blob([data])) } catch (error) { message = error.message }
        if (!message) throw new Error(`Accepted invalid package: ${name}`)
        if (await snapshot() !== before) throw new Error(`Left partial data: ${name}`)
        rejected.push({ name, message })
      }
      for (const kind of ['missing-manifest', 'bad-manifest', 'bad-scene', 'version', 'scene-version', 'missing-asset', 'duplicate-asset', 'extra-file', 'traversal', 'bad-type', 'checksum']) {
        const files = { ...originalFiles }, manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
        if (kind === 'version') manifest.packageVersion = 99
        if (kind === 'missing-asset') delete files[manifest.assets[0].path]
        if (kind === 'duplicate-asset') manifest.assets.push(manifest.assets[0])
        if (kind === 'bad-type') manifest.assets[0].mimeType = 'application/javascript'
        if (kind === 'checksum') files[manifest.assets[0].path] = new Uint8Array(files[manifest.assets[0].path].length)
        if (kind === 'extra-file') files['script.js'] = encode('alert(1)')
        if (kind === 'traversal') files['../scene.json'] = files['scene.json']
        if (kind === 'scene-version') { const scene = JSON.parse(new TextDecoder().decode(files['scene.json'])); scene.version = 2; files['scene.json'] = encode(scene); manifest.scene.sha256 = await sha256(files['scene.json']) }
        if (kind === 'bad-scene') { files['scene.json'] = new TextEncoder().encode('{'); manifest.scene.sha256 = await sha256(files['scene.json']) }
        files['manifest.json'] = encode(manifest)
        if (kind === 'missing-manifest') delete files['manifest.json']
        if (kind === 'bad-manifest') files['manifest.json'] = new TextEncoder().encode('{')
        await reject(kind, zipSync(files))
      }
      await reject('not-zip', new Uint8Array([1, 2, 3]))
      await reject('foreign-zip', zipSync({ 'hello.txt': encode('hello') }))
      const duplicates = new Uint8Array(input)
      const from = new TextEncoder().encode('assets/1.hdr'), to = new TextEncoder().encode('assets/0.glb')
      for (let i = 0; i <= duplicates.length - from.length; i++) if (from.every((byte, index) => duplicates[i + index] === byte)) duplicates.set(to, i)
      await reject('duplicate-zip-entry', duplicates)
      const invalidBinary = { ...originalFiles }, invalidManifest = JSON.parse(new TextDecoder().decode(invalidBinary['manifest.json']))
      const model = invalidManifest.assets.find(a => a.assetType === 'model')
      invalidBinary[model.path] = new Uint8Array(model.size)
      model.sha256 = await sha256(invalidBinary[model.path])
      invalidBinary['manifest.json'] = encode(invalidManifest)
      await reject('invalid-glb-with-valid-hash', zipSync(invalidBinary))
      const failScene = { load: id => scenes.load(id), remove: id => scenes.remove(id), save: async () => { throw new Error('Injected scene quota failure') } }
      await reject('scene-write-rollback', input, new ProjectPackageService(failScene, assets, projects))
      await reject('project-write-rollback', input, new ProjectPackageService(scenes, assets, { addImportedProject: () => { throw new Error('Injected project quota failure') } }))
      return rejected
    }, [...buffer])
    assert.equal(robustness.length, 17)
    await fresh.getByTestId('project-package-input').setInputFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') })
    await fresh.locator('.el-message--error').waitFor()
    assert.deepEqual(errors, [])
    return { freshBrowserRoundTrip: 'PASS', sceneEquivalence: 'PASS (project/asset remap only)', binaryAssets: result.assets.length,
      editor: restored, viewer, cameraLighting: 'PASS', interactionEvents: 'PASS', repeatedImport: 'PASS independent IDs/assets', robustness,
      exportReadOnly: 'PASS', externalTemplatesRequired: false }
  } catch (error) {
    console.error('Package QA', { url: fresh.url(), errors, messages: await fresh.locator('.el-message').allTextContents() })
    await fresh.screenshot({ path: '/tmp/twin-package-failure.png' })
    throw error
  } finally { await clean.close() }
}
