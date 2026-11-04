// Screens suite: the data screen builder end to end — a screen from the park template bound to the sample
// scene's live data, editing on the canvas (drop, move, resize, undo), data binding, and the preview with
// its two-way link to the 3D scene.
import assert from 'node:assert/strict'
import { createDemo, launch, mod, save, setDataSource } from './helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const dataPort = process.env.TWIN_DATA_PORT || '8787'
const { page, errors, close } = await launch()
const report = {}
const doc = () => page.evaluate(() => window.__screen.doc.value)
const widget = name => page.evaluate(n => window.__screen.doc.value.widgets.find(w => w.name === n), name)

try {
  // A 3D project with live data to link.
  const projectId = await createDemo(page, base)
  await setDataSource(page, dataPort)
  await save(page)

  // ---------------------------------------------------------------- list and template
  await page.goto(`${base}/screens`)
  await page.getByTestId('new-screen').click()
  await page.getByTestId('screen-template-park').click()
  await page.getByTestId('screen-scene').selectOption(projectId)
  await page.getByTestId('screen-name').fill('运营大屏测试')
  await page.getByTestId('screen-create').click()
  await page.waitForURL(/\/screens\/.+\/edit/)
  await page.waitForFunction(() => window.__screen?.doc.value.widgets.length > 20)
  const created = await doc()
  assert.equal(created.sceneProjectId, projectId)
  assert(created.widgets.some(w => w.type === 'scene'))
  // The template's widgets enter one after another.
  assert(created.widgets.every(w => w.enter && w.enter.delay >= 0))
  report.template = 'PASS'

  // ---------------------------------------------------------------- live data and the 3D widget
  await page.waitForFunction(() => window.__screen.runtime.twin.dataSourceStatus === 'connected', null, {
    timeout: 20000,
  })
  await page.waitForFunction(
    () => {
      const s = window.__screen
      const kpi = s.doc.value.widgets.find(w => w.name === '光伏总功率')
      return typeof s.runtime.dataFor(kpi).value === 'number'
    },
    null,
    { timeout: 20000 },
  )
  await page.waitForSelector('[data-testid="twin-scene-viewer"][data-loaded="true"]', { timeout: 60000 })
  report.liveData = 'PASS'

  // ---------------------------------------------------------------- canvas editing
  const view = await page.getByTestId('screen-canvas').boundingBox()
  await page.getByTestId('widget-chart-pie').dragTo(page.getByTestId('screen-canvas'), {
    targetPosition: { x: view.width / 2, y: view.height / 2 },
  })
  await page.waitForFunction(() => window.__screen.doc.value.widgets.some(w => w.type === 'chart-pie'))
  const pie = (await doc()).widgets.find(w => w.type === 'chart-pie')
  // The dropped widget is on top of the 3D scene; drag it with the mouse.
  const hit = await page.getByTestId(`hit-${pie.name}`).boundingBox()
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(hit.x + hit.width / 2 + i * 15, hit.y + hit.height / 2 + i * 8)
  await page.mouse.up()
  const moved = await widget(pie.name)
  assert(moved.x > pie.x + 40 && moved.y > pie.y + 20, `moved to ${moved.x},${moved.y}`)
  // Resize from the bottom-right handle.
  const handle = await page.getByTestId('handle-se').boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 40, handle.y + 30, { steps: 5 })
  await page.mouse.up()
  const resized = await widget(pie.name)
  assert(resized.w > moved.w && resized.h > moved.h, `resized to ${resized.w}×${resized.h}`)
  await page.keyboard.press(`${mod}+z`)
  await page.keyboard.press(`${mod}+z`)
  const undone = await widget(pie.name)
  assert.deepEqual([undone.x, undone.y, undone.w, undone.h], [pie.x, pie.y, pie.w, pie.h])
  report.canvasEditing = 'PASS'

  // ---------------------------------------------------------------- groups and ruler guides
  await page.evaluate(() => {
    const s = window.__screen
    s.select(s.doc.value.widgets.filter(w => ['光伏总功率', '风电总功率'].includes(w.name)).map(w => w.id))
  })
  await page.keyboard.press(`${mod}+g`)
  assert.equal((await doc()).groups.length, 1)
  await page.keyboard.press('Escape')
  // Clicking one member selects the group.
  await page.getByTestId('hit-光伏总功率').click()
  assert.equal(await page.evaluate(() => window.__screen.selection.value.length), 2)
  await page.getByTestId('tab-layers').click()
  await page.getByTestId('layer-group-组合 1').waitFor()
  await page.getByTestId('tab-widgets').click()
  // A guide pulled down from the top ruler.
  const ruler = await page.getByTestId('ruler-x').boundingBox()
  await page.mouse.move(ruler.x + 400, ruler.y + 10)
  await page.mouse.down()
  await page.mouse.move(ruler.x + 400, ruler.y + 220, { steps: 6 })
  await page.mouse.up()
  assert.equal((await doc()).guides.y.length, 1)
  await page.keyboard.press(`${mod}+Shift+g`)
  assert.equal((await doc()).groups.length, 0)
  report.groupsAndGuides = 'PASS'

  // ---------------------------------------------------------------- one-click theme (one undo step)
  await page.keyboard.press('Escape')
  await page.getByTestId('theme-能源绿').click()
  const themed = await doc()
  assert.equal(themed.page.theme, 'energy-green')
  assert.equal(themed.page.background.color, '#03110d')
  assert(themed.widgets.filter(w => w.type.startsWith('chart-')).every(w => w.props.palette[0] === '#34d399'))
  await page.keyboard.press(`${mod}+z`)
  assert.notEqual((await doc()).page.theme, 'energy-green')
  report.theme = 'PASS'
  await page.evaluate(id => window.__screen.select([id]), pie.id)

  // ---------------------------------------------------------------- data binding through the panel
  await page.getByTestId('inspector-data').click()
  await page.getByTestId('data-source').selectOption('devices')
  await page.waitForFunction(
    id => window.__screen.runtime.dataFor(window.__screen.widget(id)).rows.length > 0,
    pie.id,
    { timeout: 15000 },
  )
  assert.equal((await widget(pie.name)).data.source, 'devices')
  await page.getByTestId('data-preview').locator('table').waitFor()
  report.dataBinding = 'PASS'

  // ---------------------------------------------------------------- publishing and versions
  await page.getByTestId('screen-publish').click()
  await page.getByTestId('publish-note').fill('首版')
  await page.getByTestId('publish-confirm').click()
  await page.getByTestId('publish-link').waitFor()
  await page.keyboard.press('Escape')
  const publishedCount = (await doc()).widgets.length
  // A change after publishing stays a draft.
  await page.evaluate(() => window.__screen.addWidget('title', { x: 960, y: 500 }))
  await page.getByTestId('open-versions').click()
  await page.getByTestId('version-首版').waitFor()
  await page.keyboard.press('Escape')
  report.publish = 'PASS'

  // ---------------------------------------------------------------- list card and preview
  const screenId = (await doc()).id
  // Leaving through the editor saves the screen with a picture of the page for its card.
  await page.locator('.topbar .s-icon-btn').first().click()
  await page.waitForURL(/\/screens$/)
  const card = page.getByTestId('screen-card-运营大屏测试')
  await card.locator('img.card__image').waitFor({ timeout: 15000 })
  report.cardThumbnail = 'PASS'
  assert.equal((await card.getByTestId('screen-status').textContent()).trim(), '有修改未发布')
  // The big screen shows the published version, not the draft.
  await page.goto(`${base}/screens/${screenId}/play`)
  await page.waitForSelector('[data-widget-type="scene"]')
  assert.equal(await page.locator('.preview__stage .widget').count(), publishedCount)
  assert.equal(await page.getByTestId('preview-notice').count(), 0)
  report.bigScreenShowsPublished = 'PASS'
  await page.goto(`${base}/screens/${screenId}/preview`)
  await page.waitForSelector('[data-testid="twin-scene-viewer"][data-loaded="true"]', { timeout: 60000 })
  await page.waitForFunction(() => document.querySelectorAll('.table__body .table__row').length > 0, null, {
    timeout: 20000,
  })
  // Screen → 3D: a table row selects and locates its device; the details panel follows.
  await page.locator('.table__body .table__row').first().click()
  await page.waitForFunction(() => window.__screenRuntime.selectedDeviceId.value !== null)
  const link = await page.evaluate(() => {
    const runtime = window.__screenRuntime
    return {
      selected: runtime.selectedDeviceId.value,
      inViewer: [...runtime.viewers.values()][0].getSelection()?.deviceId,
    }
  })
  assert.equal(link.inViewer, link.selected)
  await page.waitForFunction(() => document.querySelector('.panel__name')?.textContent.trim().length > 0)
  // View buttons fly the 3D view.
  await page.locator('[data-widget-type="view-buttons"]').getByTestId('scene-button-储能区').click()
  await page.waitForFunction(() => window.__screenRuntime.activeView.value !== null)
  report.previewTwoWay = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
