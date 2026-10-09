// Editor suite: builds a scene from an empty project through the real UI and checks every edit lands in the
// document, the 3D scene and the undo history; then saves, reloads, previews and exports.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { launch, mod, save, screenPointOf, screenPointOfPart, settled, studio, waitForStudio } from './helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const { page, errors, close } = await launch()
const report = {}
const doc = () => studio(page, () => window.__studio.doc.value)
const selection = () => studio(page, () => window.__studio.selection.value)

try {
  // ---------------------------------------------------------------- new project
  await page.goto(`${base}/projects`)
  await page.getByTestId('new-project').click()
  await page.getByTestId('project-name-input').fill('E2E 测试园区')
  await page.getByTestId('project-create').click()
  await page.waitForURL(/\/editor\//)
  await waitForStudio(page)
  assert.equal((await doc()).nodes.length, 0)
  report.newProject = 'PASS'

  // ---------------------------------------------------------------- adding content
  await page.getByTestId('tab-assets').click()
  await page.getByTestId('builtin-container').click()
  await page.waitForFunction(() => window.__studio.doc.value.nodes.length === 1)
  await settled(page)
  const model = (await doc()).nodes[0]
  assert.equal(model.kind, 'model')
  assert(await studio(page, id => !!window.__studio.sync.objectFor(id), model.id), 'model rendered')
  // Placed models stand on the ground: their lowest point is at y = 0.
  const bottom = await studio(
    page,
    id => {
      const object = window.__studio.sync.objectFor(id)
      return new window.__studio.engine.contentBounds.constructor().setFromObject(object, true).min.y
    },
    model.id,
  )
  assert(Math.abs(bottom) < 0.01, `model bottom at ${bottom}`)

  await page.getByTestId('primitive-box').click()
  await page.waitForFunction(() => window.__studio.doc.value.nodes.length === 2)
  const box = (await doc()).nodes[1]
  assert.equal(box.kind, 'primitive')
  assert.deepEqual(await selection(), [box.id])

  // A flow path drawn with real clicks on the canvas.
  await page.getByTestId('draw-path').click()
  const canvas = await page.getByTestId('viewport-canvas').boundingBox()
  const cx = canvas.x + canvas.width / 2
  const cy = canvas.y + canvas.height / 2
  for (const [dx, dy] of [
    [-120, 80],
    [60, 80],
    [60, -20],
  ]) {
    await page.mouse.click(cx + dx, cy + dy)
    await page.waitForTimeout(400)
  }
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__studio.doc.value.nodes.some(node => node.kind === 'path'))
  const path = (await doc()).nodes.find(node => node.kind === 'path')
  assert.equal(path.path.points.length, 3)
  report.addContent = 'PASS'

  // ---------------------------------------------------------------- selecting and editing
  await page.getByTestId('tab-scene').click()
  await page.getByTestId(`tree-row-${box.name}`).click()
  assert.deepEqual(await selection(), [box.id])
  const x = page.locator('[data-testid="position-x"] input')
  await x.fill('7')
  await x.press('Enter')
  await page.waitForFunction(id => window.__studio.node(id).transform.position[0] === 7, box.id)
  await settled(page)
  assert.equal(await studio(page, id => window.__studio.sync.objectFor(id).position.x, box.id), 7)
  await page.keyboard.press(`${mod}+z`)
  await page.waitForFunction(id => window.__studio.node(id).transform.position[0] !== 7, box.id)
  await page.keyboard.press(`${mod}+Shift+z`)
  await page.waitForFunction(id => window.__studio.node(id).transform.position[0] === 7, box.id)
  report.inspectorUndoRedo = 'PASS'

  // Picking in the viewport, and clearing by clicking empty sky.
  await page.keyboard.press('Escape')
  await settled(page)
  const boxPoint = await screenPointOf(page, box.id)
  await page.mouse.click(boxPoint.x, boxPoint.y)
  await page.waitForFunction(id => window.__studio.selection.value[0] === id, box.id)
  await page.mouse.click(cx, canvas.y + 70)
  await page.waitForFunction(() => window.__studio.selection.value.length === 0)
  report.viewportPicking = 'PASS'

  // Dragging the gizmo's X handle moves the box along X only, as one undo step.
  await page.getByTestId(`tree-row-${box.name}`).click()
  await page.keyboard.press('w')
  await settled(page)
  const handle = await studio(page, () => {
    const s = window.__studio
    const controls = s.gizmo.controls
    const pivot = controls.object
    const camera = s.engine.camera
    const origin = pivot.getWorldPosition(pivot.position.clone())
    const factor =
      origin.distanceTo(camera.position) * Math.min((1.9 * Math.tan((Math.PI * camera.fov) / 360)) / camera.zoom, 7)
    const along = origin.clone()
    along.x += ((factor * controls.size) / 4) * 0.4
    const rect = s.canvas.getBoundingClientRect()
    const toScreen = v => {
      const p = v.clone().project(camera)
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
    }
    return { from: toScreen(along), origin: toScreen(origin) }
  })
  const before = (await studio(page, id => window.__studio.node(id).transform.position, box.id)).slice()
  const dir = { x: handle.from.x - handle.origin.x, y: handle.from.y - handle.origin.y }
  const length = Math.hypot(dir.x, dir.y) || 1
  await page.mouse.move(handle.from.x, handle.from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(handle.from.x + (dir.x / length) * i * 15, handle.from.y + (dir.y / length) * i * 15)
  }
  await page.mouse.up()
  const after = await studio(page, id => window.__studio.node(id).transform.position, box.id)
  assert(after[0] > before[0] + 0.5, `gizmo moved X: ${before[0]} → ${after[0]}`)
  assert(Math.abs(after[1] - before[1]) < 1e-6 && Math.abs(after[2] - before[2]) < 1e-6)
  assert.equal(await studio(page, () => window.__studio.store.undoLabel), '移动')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForFunction(([id, x0]) => window.__studio.node(id).transform.position[0] === x0, [box.id, before[0]])
  report.gizmoDrag = 'PASS'

  // Grouping everything and back.
  await page.keyboard.press(`${mod}+a`)
  await page.keyboard.press(`${mod}+g`)
  await page.waitForFunction(() => window.__studio.doc.value.nodes.some(node => node.kind === 'group'))
  const group = (await doc()).nodes.find(node => node.kind === 'group')
  assert.equal((await doc()).nodes.filter(node => node.parentId === group.id).length, 3)
  await page.keyboard.press(`${mod}+Shift+g`)
  await page.waitForFunction(() => !window.__studio.doc.value.nodes.some(node => node.kind === 'group'))
  report.groupUngroup = 'PASS'

  // Shift-drag draws a selection box: it picks the scene's leaves (model, box, path).
  await page.keyboard.press('Escape')
  await page.keyboard.down('Shift')
  await page.mouse.move(canvas.x + 80, canvas.y + 50)
  await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 5 })
  assert(await page.getByTestId('marquee').isVisible())
  await page.mouse.move(canvas.x + canvas.width - 20, canvas.y + canvas.height - 40, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  assert.deepEqual((await selection()).sort(), [model.id, box.id, path.id].sort())
  report.boxSelection = 'PASS'

  // ---------------------------------------------------------------- data, effects, rules, interactions
  await page.getByTestId(`tree-row-${box.name}`).click()
  await page.getByTestId('inspector-tab-data').click()
  await page.getByTestId('bind-device').click()
  await page.waitForFunction(() => window.__studio.doc.value.bindings.length === 1)
  assert.equal(await page.locator('[data-testid="device-id"]').inputValue(), 'ESS-001')

  await page.getByTestId('inspector-tab-effects').click()
  await page.getByTestId('add-effect').click()
  await page.getByTestId('effect-kind-fence').click()
  await page.waitForFunction(() => window.__studio.doc.value.effects.some(effect => effect.kind === 'fence'))
  await page.getByTestId('add-rule').click()
  await page.waitForFunction(() => window.__studio.doc.value.visualRules.length === 1)

  await page.getByTestId('inspector-tab-interactions').click()
  await page.getByTestId('add-interaction').click()
  await page.waitForFunction(() => window.__studio.doc.value.interactions.length === 1)
  await settled(page)
  assert((await studio(page, () => window.__studio.effects.getDiagnostics().helpers)) >= 1)
  report.dataEffectsRulesInteractions = 'PASS'

  // ---------------------------------------------------------------- look, views and tours
  await page.keyboard.press('Escape')
  await page.getByTestId('scene-tab-environment').click()
  await page.getByTestId('preset-night').click()
  await page.waitForFunction(() => window.__studio.doc.value.settings.time.hour === 22)
  assert.equal((await doc()).settings.sky.mode, 'gradient')

  await page.getByTestId('add-bookmark').click()
  await page.waitForFunction(() => window.__studio.doc.value.bookmarks.length === 1)
  assert((await doc()).bookmarks[0].thumbnail.startsWith('data:image/jpeg'))
  await page.getByTestId('new-tour').click()
  await page.getByTestId('add-step').click()
  await page.waitForFunction(() => window.__studio.doc.value.tours[0]?.steps.length === 1)
  await page.getByTestId('play-tour').click()
  await page.waitForSelector('[data-testid="tour-bar"]')
  await studio(page, () => window.__studio.stopTour())
  await page.waitForSelector('[data-testid="tour-bar"]', { state: 'detached' })
  report.lookViewsTours = 'PASS'

  // ---------------------------------------------------------------- panel layout
  const leftWidth = async () => Math.round((await page.locator('.studio__left').boundingBox()).width)
  const panelBefore = await leftWidth()
  const resizer = await page.locator('.studio__left .resize-handle').boundingBox()
  await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + 200)
  await page.mouse.down()
  await page.mouse.move(resizer.x + resizer.width / 2 + 80, resizer.y + 200, { steps: 5 })
  await page.mouse.up()
  assert.equal(await leftWidth(), panelBefore + 80)

  // ---------------------------------------------------------------- save, reload, preview
  await save(page)
  const saved = await doc()
  await page.reload()
  await waitForStudio(page)
  const reloaded = await doc()
  assert.equal(reloaded.nodes.length, saved.nodes.length)
  assert.deepEqual(
    [reloaded.bindings.length, reloaded.effects.length, reloaded.bookmarks.length, reloaded.tours.length],
    // The tour step captured its own view, so there are two views.
    [1, 1, 2, 1],
  )
  assert.equal(reloaded.settings.time.hour, 22)
  assert.equal(await leftWidth(), panelBefore + 80, 'panel width is remembered')
  report.saveReload = 'PASS'
  report.panelResize = 'PASS'

  await page.getByTestId('mode-preview').click()
  await page.waitForSelector('.studio.is-preview')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.studio:not(.is-preview)')
  report.preview = 'PASS'

  // ---------------------------------------------------------------- export
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-package').click()])
  const bytes = await readFile(await download.path())
  const contents = await page.evaluate(
    async bytes => {
      const core = window.__twinCore
      const files = core.readPackageZip(new Uint8Array(bytes))
      const scene = JSON.parse(new TextDecoder().decode(files.get('scene.json')))
      const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')))
      return {
        version: scene.version,
        nodes: scene.nodes.length,
        assets: manifest.assets.map(asset => asset.assetType),
      }
    },
    [...bytes],
  )
  assert.deepEqual(contents, { version: 2, nodes: saved.nodes.length, assets: ['model'] })
  report.exportPackage = 'PASS'

  // ---------------------------------------------------------------- delete cascades
  await page.getByTestId(`tree-row-${box.name}`).click()
  await page.keyboard.press('Delete')
  await page.waitForFunction(() => window.__studio.doc.value.bindings.length === 0)
  const final = await doc()
  assert.equal(final.effects.length + final.visualRules.length + final.interactions.length, 0)
  report.deleteCascade = 'PASS'

  // ---------------------------------------------------------------- compressed deliveries
  // Draco geometry and KTX2 textures decode with the decoders bundled into the app (no CDN).
  await page.getByTestId('tab-assets').click()
  await page
    .getByTestId('asset-upload')
    .setInputFiles(fileURLToPath(new URL('./fixtures/turbine-draco-ktx2.glb', import.meta.url)))
  const card = page.getByTestId('asset-turbine-draco-ktx2.glb')
  await card.click()
  await page.waitForFunction(() => window.__studio.doc.value.nodes.some(node => node.name === 'turbine-draco-ktx2'))
  await settled(page)
  const compressed = await studio(page, () => {
    const s = window.__studio
    const node = s.doc.value.nodes.find(item => item.name === 'turbine-draco-ktx2')
    const meshes = []
    s.sync.objectFor(node.id).traverse(object => object.isMesh && meshes.push(object))
    return {
      meshes: meshes.length,
      vertices: meshes.every(mesh => mesh.geometry.attributes.position.count > 0),
      ktx2: meshes.some(mesh => mesh.material.map?.isCompressedTexture === true),
    }
  })
  assert(compressed.meshes > 0 && compressed.vertices, JSON.stringify(compressed))
  assert(compressed.ktx2, 'KTX2 texture decoded')
  // The library thumbnail goes through the same decoders.
  await card.locator('img').waitFor({ timeout: 20000 })
  report.compressedModels = 'PASS'

  // ---------------------------------------------------------------- model parts
  // Double-clicking a model selects the part under the pointer; the part gets its own material, visibility
  // and device binding, and Esc goes back up to the model.
  const nodeCount = (await doc()).nodes.length
  await page.getByTestId('builtin-turbine').click()
  await page.waitForFunction(count => window.__studio.doc.value.nodes.length === count + 1, nodeCount)
  await settled(page)
  const turbine = (await doc()).nodes.at(-1)
  assert.equal(turbine.kind, 'model')
  const blades = 'legacy:root/0/0'
  await page.keyboard.press('f')
  await page.waitForTimeout(900)
  const hub = await screenPointOfPart(page, turbine.id, blades)
  await page.mouse.dblclick(hub.x, hub.y)
  await page.waitForFunction(id => window.__studio.part.value?.nodeId === id, turbine.id)
  assert.equal(await studio(page, () => window.__studio.part.value.assetNodeId), blades)
  await page.getByTestId('part-properties').waitFor()
  await page.getByTestId('tab-scene').click()
  await page.getByTestId('tree-part-blades').waitFor()
  await page.getByTestId('material-preset-玻璃').click()
  const glass = await studio(
    page,
    ([id, part]) => {
      const material = window.__studio.sync.partObject(id, part).material
      return { opacity: material.opacity, transparent: material.transparent }
    },
    [turbine.id, blades],
  )
  assert.deepEqual(glass, { opacity: 0.35, transparent: true })
  await page.getByTestId('part-visible').click()
  await page.waitForFunction(
    ([id, part]) => window.__studio.sync.partObject(id, part).visible === false,
    [turbine.id, blades],
  )
  await page.getByTestId('inspector-tab-data').click()
  await studio(
    page,
    id =>
      window.__studio.setBinding(id, {
        device: { id: 'WT-BLADE', name: '叶片' },
        variables: [{ id: 'v', key: 'vibration', name: '振动', dataType: 'number' }],
      }),
    turbine.id,
  )
  const partBinding = await studio(
    page,
    () => window.__studio.doc.value.bindings.find(b => b.device.id === 'WT-BLADE').target,
  )
  assert.deepEqual(partBinding, { type: 'asset-node', instanceId: turbine.id, assetNodeId: blades })
  await page.getByTestId('inspector-tab-properties').click()
  await page.keyboard.press('Escape')
  await page.waitForFunction(id => !window.__studio.part.value && window.__studio.selection.value[0] === id, turbine.id)

  // Replacing the model keeps the node and its part edits; the replacement here has no blades, so the
  // dialog reports it. Undo brings the turbine back with everything intact.
  await page.getByTestId('replace-model').click()
  await page.getByTestId('replace-option-储热罐').click()
  await page.getByTestId('replace-confirm').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="replace-model-options"]')?.offsetParent)
  await settled(page)
  assert.notEqual((await doc()).nodes.find(node => node.id === turbine.id).model.assetId, turbine.model.assetId)
  await page.keyboard.press(`${mod}+z`)
  await settled(page)
  const restored = (await doc()).nodes.find(node => node.id === turbine.id)
  assert.equal(restored.model.assetId, turbine.model.assetId)
  assert.equal(restored.model.overrides[blades].material.opacity, 0.35)

  // Deleting a part removes what was bound to it.
  await page.getByTestId('tree-part-blades').click()
  await page.keyboard.press('Delete')
  await page.waitForFunction(
    id => window.__studio.doc.value.nodes.find(node => node.id === id).model.deleted.length === 1,
    turbine.id,
  )
  assert.equal(
    await studio(page, () => window.__studio.doc.value.bindings.some(b => b.device.id === 'WT-BLADE')),
    false,
  )
  report.modelParts = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
