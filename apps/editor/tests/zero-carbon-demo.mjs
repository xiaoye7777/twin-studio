// Demo suite: the zero-carbon sample end to end in the editor — structure, live data from the simulator,
// alarm rules, generated view thumbnails, the guided tour in preview, and the project card cover.
import assert from 'node:assert/strict'
import { createDemo, launch, save, setDataSource, studio } from './helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const dataPort = process.env.TWIN_DATA_PORT || '8787'
const { page, errors, close } = await launch()
const report = {}

try {
  await createDemo(page, base)
  const summary = await studio(page, () => {
    const doc = window.__studio.doc.value
    return {
      groups: doc.nodes.filter(node => node.kind === 'group').map(node => node.name),
      paths: doc.nodes.filter(node => node.kind === 'path').length,
      areas: doc.nodes.filter(node => node.kind === 'area').length,
      bindings: doc.bindings.length,
      rules: doc.visualRules.length,
      bookmarks: doc.bookmarks.length,
      steps: doc.tours[0]?.steps.length,
      autoplay: doc.presentation.autoplayTourId === doc.tours[0]?.id,
    }
  })
  assert.deepEqual(summary.groups.sort(), ['储能区', '光伏区', '能流', '建筑', '道路与绿化', '风电区'].sort())
  assert.deepEqual(
    [summary.paths, summary.areas, summary.bindings, summary.rules, summary.bookmarks, summary.steps, summary.autoplay],
    [5, 1, 14, 16, 5, 5, true],
  )
  report.structure = summary
  // The park floor carries a glowing grid pattern, drawn locally (no texture files in the package).
  const floor = await studio(page, () => {
    const material = window.__studio.sync.objectFor('park-ground').material
    return { map: !!material.map, glow: !!material.emissiveMap }
  })
  assert.deepEqual(floor, { map: true, glow: true })

  // Live data: the simulator generates values for exactly the devices this project subscribes to.
  await setDataSource(page, dataPort)
  await page.waitForFunction(
    () => {
      const twin = window.__studio.twin
      const meter = twin.bindings.find(binding => binding.device.id === 'EM-001')
      return meter && typeof twin.getRuntimeValue(meter.id, 'power')?.value === 'number'
    },
    null,
    { timeout: 20000 },
  )
  // ESS-003 overheats for 6 of every 12 simulator ticks; its alarm rules then fire.
  await page.waitForFunction(() => window.__studio.rules.getDiagnostics().activeRules >= 1, null, { timeout: 30000 })
  report.liveDataAndAlarms = 'PASS'

  // Turbine blades spin, and faster when the live rotor speed says so.
  const bladeAngle = () =>
    studio(page, () => {
      let blades
      window.__studio.sync.objectFor('instance_wind-1').traverse(node => {
        if (node.name === 'blades') blades = node
      })
      return blades.quaternion.toArray()
    })
  const first = await bladeAngle()
  await page.waitForTimeout(300)
  assert.notDeepEqual(await bladeAngle(), first, 'blades are spinning')
  report.partMotion = 'PASS'

  // Labels never overlap on screen: crowded ones stack upwards or fade out.
  const overlaps = await studio(page, () => {
    const s = window.__studio
    const camera = s.engine.camera
    const rect = s.canvas.getBoundingClientRect()
    const boxes = []
    s.engine.scene.traverse(node => {
      if (!node.isSprite || node.layoutAlpha === undefined || node.layoutAlpha < 0.95 || node.scale.y === 0) return
      for (let p = node; p; p = p.parent) if (!p.visible) return
      const anchor = node.getWorldPosition(node.position.clone()).project(camera)
      if (anchor.z > 1) return
      const x = ((anchor.x + 1) / 2) * rect.width
      const y = ((1 - anchor.y) / 2) * rect.height
      const w = (node.scale.x * camera.projectionMatrix.elements[0] * rect.width) / 2
      const h = (node.scale.y * camera.projectionMatrix.elements[5] * rect.height) / 2
      const top = y - h + node.center.y * h
      boxes.push({ left: x - w / 2, right: x + w / 2, top, bottom: top + h })
    })
    let count = 0
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) count++
      }
    return { count, labels: boxes.length }
  })
  assert(overlaps.labels >= 3, `labels on screen: ${overlaps.labels}`)
  assert.equal(overlaps.count, 0)
  report.labelLayout = overlaps

  // Views saved without thumbnails get rendered ones, without moving the camera.
  const camera = await studio(page, () => window.__studio.engine.camera.position.toArray())
  await page.waitForFunction(() => Object.keys(window.__studio.thumbnails).length === 5, null, { timeout: 20000 })
  assert.deepEqual(await studio(page, () => window.__studio.engine.camera.position.toArray()), camera)
  report.viewThumbnails = 'PASS'

  // The guided tour in preview mode: captions, stepping, and Esc hands control back.
  await page.getByTestId('mode-preview').click()
  // The sample limits the camera on the big screen; the editor itself stays free.
  const previewRange = await studio(page, () => window.__studio.engine.rig.controls.maxDistance)
  assert(previewRange > 20 && previewRange < 1000, `preview max distance ${previewRange}`)
  await studio(page, () => window.__studio.playTour(window.__studio.doc.value.tours[0].id))
  await page.waitForSelector('[data-testid="tour-bar"]')
  assert((await page.getByTestId('tour-bar').textContent()).includes('零碳智慧园区'))
  await studio(page, () => window.__studio.tours.next())
  await page.waitForFunction(() => window.__studio.ui.tour.stepIndex === 1)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__studio.ui.mode === 'edit' && !window.__studio.ui.tour.playing)
  assert.equal(await studio(page, () => window.__studio.engine.rig.controls.maxDistance), 8000)
  report.tourPreview = 'PASS'

  // Performance check from the viewport's stats: the sample is within the ordinary-PC budget.
  await page.getByTestId('viewport-stats').click()
  await page.getByTestId('performance-report').waitFor()
  const tips = await page.getByTestId('performance-tips').textContent()
  assert(tips.includes('建议范围内'), tips)
  assert.equal(await page.locator('.perf__table tbody tr').count(), 8)
  await page.keyboard.press('Escape')
  await page.getByTestId('performance-report').waitFor({ state: 'hidden' })
  report.performanceCheck = 'PASS'

  // Saving puts a picture of the opening view on the project card.
  await save(page)
  await page.waitForTimeout(500)
  await page.goto(`${base}/projects`)
  const cover = await page.locator('[data-testid="project-card-零碳智慧园区 Demo"] img').getAttribute('src')
  assert(cover?.startsWith('data:image/jpeg'), 'project cover is a scene screenshot')
  report.projectCover = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
