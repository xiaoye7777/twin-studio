// Demo suite: the zero-carbon sample end to end in the editor — structure, live data from the simulator,
// alarm rules, generated view thumbnails, the guided tour in preview, and the project card cover.
import assert from 'node:assert/strict'
import { createDemo, launch, save, setDataSource, studio, waitForStudio } from './helpers.mjs'

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
  await page.waitForFunction(() => window.__studio.ruleRuntime.getDiagnostics().activeRules >= 1, null, {
    timeout: 30000,
  })
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
  await studio(page, () => window.__studio.views.playTour(window.__studio.doc.value.tours[0].id))
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

  // ---------------------------------------------------------------- several data interfaces at once
  await page.goBack()
  await waitForStudio(page)
  await page.getByTestId('scene-tab-data').click()
  const meter = () =>
    studio(page, () => {
      const twin = window.__studio.twin
      const binding = twin.bindings.find(item => item.device.id === 'EM-001')
      const read = key => {
        const value = twin.getRuntimeValue(binding.id, key)
        return value && { value: value.value, source: window.__studio.devices.source(value.sourceId)?.name }
      }
      return { power: read('power'), variables: binding.variables.map(item => item.key) }
    })
  /** Waits until EM-001's power comes from this interface (and has this value, when given). */
  const waitPower = (source, expected) =>
    page.waitForFunction(
      ([name, value]) => {
        const twin = window.__studio.twin
        const binding = twin.bindings.find(item => item.device.id === 'EM-001')
        const power = twin.getRuntimeValue(binding.id, 'power')
        return (
          power &&
          window.__studio.devices.source(power.sourceId)?.name === name &&
          (value === null || power.value === value)
        )
      },
      [source, expected ?? null],
      { timeout: 20000 },
    )

  // First interface: HTTP polling of the simulator, next to the WebSocket gateway.
  await page.getByTestId('add-source').click()
  await page.getByTestId('add-source-http').click()
  const firstSource = page.getByTestId('source-定时请求接口')
  await firstSource.getByTestId('datasource-http-url').fill(`http://127.0.0.1:${dataPort}/api/devices/latest`)
  await firstSource.getByTestId('datasource-http-url').press('Enter')
  await page.getByTestId('source-enabled-实时设备数据').click()
  await waitPower('定时请求接口')
  report.httpPolling = 'PASS'

  // Second interface in another format: one row per variable, text numbers, other field names.
  let meterResponse = {
    code: 0,
    data: {
      rows: [
        { id: 'EM-001', name: 'power', val: '123.5' },
        { id: 'EM-404', name: 'power', val: '1' },
      ],
    },
  }
  await page.route('**/api/park/meters**', route =>
    meterResponse
      ? route.fulfill({
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(meterResponse),
        })
      : route.abort(),
  )
  await page.getByTestId('add-source').click()
  await page.getByTestId('add-source-http').click()
  const secondSource = page.getByTestId('source-定时请求接口 2')
  await secondSource.getByTestId('source-method').selectOption('GET')
  await secondSource.getByTestId('datasource-http-url').fill(`http://127.0.0.1:${dataPort}/api/park/meters`)
  await secondSource.getByTestId('datasource-http-url').press('Enter')
  await secondSource.getByTestId('source-interval').fill('1')
  await secondSource.getByTestId('source-interval').press('Enter')
  // Query parameters are sent; a sign-in header is refused, because scene files travel.
  await secondSource.getByText('查询参数', { exact: true }).click()
  await secondSource.getByTestId('source-params-add').click()
  await secondSource.getByTestId('source-params-key-0').fill('site')
  await secondSource.getByTestId('source-params-key-0').press('Enter')
  await secondSource.getByTestId('source-params-value-0').fill('east')
  await secondSource.getByTestId('source-params-value-0').press('Enter')
  await secondSource.getByText('请求头', { exact: true }).click()
  await secondSource.getByTestId('source-headers-add').click()
  await secondSource.getByTestId('source-headers-key-0').fill('Authorization')
  await secondSource.getByTestId('source-headers-key-0').press('Enter')
  await secondSource.getByText('不能写进场景文件').waitFor()

  // A test request finds the list in the response, then parsing settings update the verdict without a new request.
  await secondSource.getByTestId('source-probe').click()
  await secondSource.getByTestId('source-probe-result').getByText('没有解析出数值').waitFor()
  await secondSource.getByText('数据解析', { exact: true }).click()
  assert.equal(await secondSource.getByTestId('source-result-path').inputValue(), 'data.rows')
  await secondSource.getByTestId('source-format').selectOption('metric-row')
  await secondSource.getByTestId('source-device-field').fill('id')
  await secondSource.getByTestId('source-device-field').press('Enter')
  await secondSource.getByTestId('source-metric-field').fill('name')
  await secondSource.getByTestId('source-metric-field').press('Enter')
  await secondSource.getByTestId('source-value-field').fill('val')
  await secondSource.getByTestId('source-value-field').press('Enter')
  await secondSource.getByTestId('source-probe-result').getByText('认出 1 台设备，解析出 1 个值').waitFor()

  // This interface covers one device and one variable.
  await secondSource.getByText('涉及设备', { exact: true }).click()
  await secondSource.getByTestId('source-device-mode').getByText('指定设备').click()
  await secondSource.getByTestId('source-add-device').selectOption('EM-001')
  await secondSource.getByText('EM-001').first().click()
  const onlyPower = await studio(page, () => {
    const binding = window.__studio.twin.bindings.find(item => item.device.id === 'EM-001')
    return binding.variables.map(item => item.key).filter(key => key !== 'power')
  })
  for (const key of onlyPower) await secondSource.getByTestId(`source-var-EM-001-${key}`).uncheck()
  const scope = await studio(page, () => window.__studio.devices.sources.at(-1).devices)
  assert.deepEqual(scope, [{ deviceId: 'EM-001', variables: ['power'] }])

  // Lower in the list it only fills gaps; moved up it wins, and the device mixes values from both.
  await waitPower('定时请求接口')
  await secondSource.getByTestId('source-menu').click()
  await page.getByText('上移（优先）').click()
  await waitPower('定时请求接口 2', 123.5)
  assert.equal(
    await page.getByTestId('source-定时请求接口 2').getByTestId('datasource-status').textContent(),
    '请求成功',
  )
  report.twoInterfacesOneDevice = 'PASS'

  // The device list shows each variable's source.
  await page.getByTestId('device-EM-001').locator('header').click()
  await page.getByTestId('device-EM-001').getByText('定时请求接口 2').first().waitFor()

  // One interface failing clears only its values; the next one takes over, and the rest keep working.
  meterResponse = null
  await page.getByTestId('source-定时请求接口 2').getByTestId('source-error').waitFor({ timeout: 10000 })
  await waitPower('定时请求接口')
  assert.equal(await studio(page, () => window.__studio.twin.dataSourceStatus), 'connected')
  assert((await page.getByTestId('status-data').textContent()).includes('1/2 个接口'))
  assert.equal(await page.getByTestId('source-定时请求接口').getByTestId('source-error').count(), 0)
  report.interfaceFailureIsolated = 'PASS'

  // Static data: a value typed in the panel reaches the runtime at once, and fills in when nothing else provides it.
  await page.getByTestId('add-source').click()
  await page.getByTestId('add-source-static').click()
  const input = page.getByTestId('source-static-EM-001-power')
  await input.fill('321')
  await input.press('Enter')
  await page.getByTestId('source-enabled-定时请求接口').click()
  await page.getByTestId('source-enabled-定时请求接口 2').click()
  await waitPower('静态数据', 321)
  const fixed = await studio(page, () => window.__studio.devices.sources.find(item => item.type === 'static').values)
  assert.equal(fixed['EM-001'].power, 321)
  report.staticData = 'PASS'

  // All of it saves and comes back.
  await save(page)
  await page.reload()
  await waitForStudio(page)
  assert.deepEqual(
    await studio(page, () => window.__studio.doc.value.dataSources.map(item => [item.name, item.enabled])),
    [
      ['实时设备数据', false],
      ['定时请求接口 2', false],
      ['定时请求接口', false],
      ['静态数据', true],
    ],
  )
  assert.deepEqual((await meter()).power, { value: 321, source: '静态数据' })
  report.interfacesSaved = 'PASS'

  // A registered interface becomes a scene interface; its token is sent, but stays out of the scene file.
  await page.evaluate(async url => {
    const { useDataSourceStore } = await import('/src/screen/datasources/store.ts')
    const { createConnection, createDataset } = await import('/src/screen/datasources/model.ts')
    const store = useDataSourceStore()
    await store.load()
    const connection = { ...createConnection('园区后台', url), auth: { type: 'bearer', token: 'secret-token' } }
    await store.saveConnection(connection)
    await store.saveDatasets([
      createDataset(connection.id, {
        name: '电表实时',
        path: '/meters',
        resultPath: 'data.rows',
        refresh: 2,
        params: [{ key: 'site', label: '站点', in: 'query', type: 'string', required: false, default: 'east' }],
      }),
    ])
  }, `http://127.0.0.1:${dataPort}/api/park`)
  await page.getByTestId('scene-tab-data').click()
  await page.getByTestId('add-source').click()
  await page.getByTestId('add-source-http').click()
  const signedIn = page.waitForRequest(
    request =>
      request.url().includes('/api/park/meters?site=east') && request.headers().authorization === 'Bearer secret-token',
  )
  await page.getByTestId('source-定时请求接口 3').getByTestId('source-import').selectOption({ label: '电表实时' })
  await signedIn
  const imported = await studio(page, () => window.__studio.devices.sources.at(-1))
  assert.deepEqual(
    [imported.name, imported.method, imported.interval, imported.resultPath, imported.params],
    ['电表实时', 'GET', 2, 'data.rows', [{ key: 'site', value: 'east' }]],
  )
  assert(imported.authRef, 'the interface refers to the registered service')
  const sceneFile = await studio(page, () => JSON.stringify(window.__studio.doc.value))
  assert(!sceneFile.includes('secret-token'), 'the token never enters the scene file')
  report.registeredInterface = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
