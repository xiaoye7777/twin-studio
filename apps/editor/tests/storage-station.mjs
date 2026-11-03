// Storage station case: created from the project page menu, data comes from labelled static sources, and a
// cabinet opens and explodes with real mouse input in the preview.
import assert from 'node:assert/strict'
import { launch, screenPointOfPart, settled, studio, waitForStudio } from './helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const { page, errors, close } = await launch()
const report = {}

try {
  await page.goto(`${base}/projects`)
  await page.getByTestId('create-demo').click()
  await page.getByTestId('create-demo-park').waitFor()
  await page.getByTestId('create-demo-storage').click()
  await page.waitForURL(/\/editor\/storage-station-/, { timeout: 90000 })
  await waitForStudio(page)
  await settled(page)
  report.createdFromMenu = 'PASS'

  const summary = await studio(page, () => {
    const doc = window.__studio.doc.value
    const assets = new Set(doc.nodes.filter(node => node.kind === 'model').map(node => node.model.assetId))
    return {
      cabinets: doc.nodes.filter(node => node.name.startsWith('储能柜 ')).length,
      assets: assets.size,
      sources: doc.dataSources.map(source => [source.type, source.name]),
      bookmarks: doc.bookmarks.length,
      tour: doc.tours[0]?.steps.length,
      status: window.__studio.twin.dataSourceStatus,
    }
  })
  assert.equal(summary.cabinets, 21)
  assert(summary.assets > 10, `${summary.assets} models`)
  assert(summary.sources.every(([type, name]) => type === 'static' && name.startsWith('示例静态数据')))
  assert.equal(summary.bookmarks, 7)
  assert.equal(summary.tour, 7)
  assert.equal(summary.status, 'connected')
  report.scene = 'PASS'

  // Every device reads from the static sources; cabinet 13 shows the example warning.
  const hot = await studio(page, () => {
    const twin = window.__studio.twin
    const binding = window.__studio.doc.value.bindings.find(item => item.device.id === 'ESS-13')
    return twin.getRuntimeValue(binding.id, 'temperature')?.value
  })
  assert.equal(hot, 47.6)
  report.values = 'PASS'

  // The sample on its own pad is the full model; the rows use the light one.
  const cabinet = name => studio(page, n => window.__studio.doc.value.nodes.find(node => node.name === n).id, name)
  const hero = await cabinet('储能柜样机')
  const light = await cabinet('储能柜 02')
  const hasPart = (id, part) => studio(page, ([i, p]) => !!window.__studio.sync.partObject(i, p), [id, part])
  assert(await hasPart(hero, 'ess.pack09.cells'))
  assert(await hasPart(light, 'ess.packs'))

  await studio(page, () => window.__studio.select([]))
  await page.getByTestId('mode-preview').click()
  await page.waitForSelector('.studio.is-preview')
  await studio(page, () => {
    const s = window.__studio
    const v = s.doc.value.bookmarks.find(item => item.name === '样机爆炸').view
    s.engine.rig.controls.setLookAt(...v.position, ...v.target, false)
  })
  await page.waitForTimeout(500)
  const angle = id =>
    studio(
      page,
      i => (2 * Math.asin(window.__studio.sync.partObject(i, 'ess.door.battery').quaternion.y) * 180) / Math.PI,
      id,
    )
  const point = await screenPointOfPart(page, hero, 'ess.door.electrical')
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction(
    id =>
      Math.abs(
        (2 * Math.asin(window.__studio.sync.partObject(id, 'ess.door.battery').quaternion.y) * 180) / Math.PI + 110,
      ) < 2,
    hero,
    { timeout: 20000 },
  )
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction(
    id => Math.abs(window.__studio.sync.partObject(id, 'ess.door.battery').quaternion.y) < 0.02,
    hero,
    { timeout: 20000 },
  )
  await page.waitForTimeout(400)
  const roofBefore = await studio(page, id => window.__studio.sync.partObject(id, 'ess.roof').position.y, hero)
  await page.mouse.dblclick(point.x, point.y)
  await page.waitForFunction(
    ([id, y]) => window.__studio.sync.partObject(id, 'ess.roof').position.y > y + 0.5,
    [hero, roofBefore],
    { timeout: 20000 },
  )
  report.explode = 'PASS'

  await page.keyboard.press('Escape')
  await page.waitForSelector('.studio:not(.is-preview)')
  assert(Math.abs(await angle(hero)) < 1)
  report.backInPose = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
