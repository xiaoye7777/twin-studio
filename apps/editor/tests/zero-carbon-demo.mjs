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

  // Views saved without thumbnails get rendered ones, without moving the camera.
  const camera = await studio(page, () => window.__studio.engine.camera.position.toArray())
  await page.waitForFunction(() => Object.keys(window.__studio.thumbnails).length === 5, null, { timeout: 20000 })
  assert.deepEqual(await studio(page, () => window.__studio.engine.camera.position.toArray()), camera)
  report.viewThumbnails = 'PASS'

  // The guided tour in preview mode: captions, stepping, and Esc hands control back.
  await page.getByTestId('mode-preview').click()
  await studio(page, () => window.__studio.playTour(window.__studio.doc.value.tours[0].id))
  await page.waitForSelector('[data-testid="tour-bar"]')
  assert((await page.getByTestId('tour-bar').textContent()).includes('零碳智慧园区'))
  await studio(page, () => window.__studio.tours.next())
  await page.waitForFunction(() => window.__studio.ui.tour.stepIndex === 1)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__studio.ui.mode === 'edit' && !window.__studio.ui.tour.playing)
  report.tourPreview = 'PASS'

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
