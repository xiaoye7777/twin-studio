// Interfaces suite: backend HTTP interfaces on data screens, against the device simulator's demo API —
// registering a data service, importing interfaces from OpenAPI and a pasted cURL, testing one, binding
// widgets with parameters that follow screen variables, errors on widgets, and screen files carrying their
// interfaces without secrets.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { launch } from './helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const dataPort = process.env.TWIN_DATA_PORT || '8787'
const service = `http://127.0.0.1:${dataPort}`
const { page, errors, close } = await launch()
const report = {}

try {
  // ---------------------------------------------------------------- a data service
  await page.goto(`${base}/datasources`)
  await page.getByTestId('add-connection').first().click()
  await page.getByTestId('connection-name').fill('园区后台')
  await page.getByTestId('connection-url').fill(service)
  await page.getByTestId('connection-save').click()
  await page.getByTestId('connection-园区后台').waitFor()
  report.connection = 'PASS'

  // ---------------------------------------------------------------- OpenAPI import (address found by itself)
  await page.getByTestId('open-import').click()
  await page.getByTestId('openapi-read').click()
  await page.getByText('零碳园区业务接口（演示）').waitFor()
  // GET interfaces are chosen by default; the POST one is picked by hand.
  await page.getByTestId('import-openapi').getByText('告警记录').click()
  await page.getByTestId('openapi-import').click()
  await page.getByTestId('dataset-建筑能耗排行').waitFor()
  const imported = await page.evaluate(() =>
    window.__dataSources.datasets.map(item => ({ ...item, sample: undefined })),
  )
  assert.equal(imported.length, 7)
  const trend = imported.find(item => item.name === '近 N 日能源趋势')
  assert.equal(trend.resultPath, 'data.list')
  assert.deepEqual(
    trend.fields.map(field => [field.key, field.label, field.unit ?? '']),
    [
      ['date', '日期', ''],
      ['pv', '光伏', 'kWh'],
      ['wind', '风电', 'kWh'],
      ['grid', '市电', 'kWh'],
      ['load', '总负荷', 'kWh'],
    ],
  )
  const alarms = imported.find(item => item.name === '告警记录')
  assert.equal(alarms.method, 'POST')
  assert.equal(alarms.resultPath, 'data.records')
  assert.deepEqual(
    alarms.params.map(param => [param.key, param.in, param.type]),
    [
      ['level', 'body', 'enum'],
      ['limit', 'body', 'number'],
    ],
  )
  const history = imported.find(item => item.name === '设备历史曲线')
  assert(history.params.some(param => param.key === 'deviceId' && param.in === 'path' && param.required))
  report.openApiImport = 'PASS'

  // ---------------------------------------------------------------- testing an interface in its editor
  await page.getByTestId('dataset-告警记录').dblclick()
  await page.getByTestId('dataset-test').click()
  await page.getByTestId('dataset-test-result').getByText('成功 · HTTP 200').waitFor()
  await page.getByTestId('dataset-save').click()
  report.testRequest = 'PASS'

  // ---------------------------------------------------------------- cURL: address, parameters and sign-in recognised
  await page.getByTestId('open-import').click()
  await page.getByTestId('import-tab-curl').click()
  await page
    .getByTestId('curl-text')
    .fill(
      `curl '${service}/api/buildings/consumption?month=2026-09&top=5' \\\n  -H 'Accept: application/json' \\\n  -H 'Authorization: Bearer secret-token'`,
    )
  await page.getByTestId('curl-create').click()
  // The editor opens and tries the request at once, so fields are there to describe.
  await page.getByTestId('dataset-fields').waitFor()
  await page.getByTestId('dataset-name').fill('楼栋能耗（cURL）')
  await page.getByTestId('dataset-field-kwh').fill('月用电量')
  await page.getByTestId('dataset-save').click()
  await page.getByTestId('dataset-楼栋能耗（cURL）').waitFor()
  const curl = await page.evaluate(() => {
    const store = window.__dataSources
    const dataset = store.datasets.find(item => item.name === '楼栋能耗（cURL）')
    return { dataset, connection: store.connection(dataset.connectionId) }
  })
  assert.equal(curl.dataset.path, '/api/buildings/consumption')
  assert.deepEqual(
    curl.dataset.params.map(param => [param.key, param.type, param.default]),
    [
      ['month', 'month', '2026-09'],
      ['top', 'number', '5'],
    ],
  )
  assert.equal(curl.dataset.resultPath, 'data.list')
  assert.equal(curl.connection.name, '园区后台')
  assert.deepEqual(curl.connection.auth, { type: 'bearer', token: 'secret-token' })
  report.curlImport = 'PASS'

  // ---------------------------------------------------------------- a widget on an interface
  await page.goto(`${base}/screens`)
  await page.getByTestId('new-screen').click()
  await page.getByTestId('screen-template-blank').click()
  await page.getByTestId('screen-name').fill('接口大屏')
  await page.getByTestId('screen-create').click()
  await page.waitForURL(/\/screens\/.+\/edit/)
  await page.waitForFunction(() => !!window.__screen)
  await page.evaluate(() => window.__screen.addWidget('chart-line', { x: 100, y: 100 }))
  await page.getByTestId('inspector-data').click()
  await page.getByTestId('data-source').selectOption('api')
  await page.getByTestId('api-dataset').click()
  await page.getByTestId('api-option-近 N 日能源趋势').click()
  const chartId = await page.evaluate(() => window.__screen.selection.value[0])
  const rows = () =>
    page.evaluate(id => {
      const s = window.__screen
      return s.runtime.dataFor(s.widget(id), 'rows').rows.length
    }, chartId)
  await page.waitForFunction(
    id => window.__screen.runtime.dataFor(window.__screen.widget(id)).rows.length === 7,
    chartId,
  )
  // The parameter is a drop-down with the interface's choices.
  await page.getByTestId('api-param-days').selectOption('14')
  await page.waitForFunction(
    id => window.__screen.runtime.dataFor(window.__screen.widget(id)).rows.length === 14,
    chartId,
  )
  assert.equal(await rows(), 14)
  await page.getByTestId('api-status').getByText('已加载').waitFor()
  const chart = await page.evaluate(id => window.__screen.runtime.dataFor(window.__screen.widget(id)), chartId)
  assert.equal(chart.dimension, 'date')
  assert.deepEqual(chart.measures, ['pv', 'wind', 'grid'])
  assert.equal(chart.labels.pv, '光伏')
  // A figure from a one-record interface.
  await page.evaluate(() => window.__screen.addWidget('kpi', { x: 900, y: 100 }))
  await page.getByTestId('inspector-data').click()
  await page.getByTestId('data-source').selectOption('api')
  await page.getByTestId('api-dataset').click()
  await page.getByTestId('api-option-今日能源概览').click()
  await page.getByTestId('api-value-field').selectOption('greenRatio')
  const kpiId = await page.evaluate(() => window.__screen.selection.value[0])
  await page.waitForFunction(
    id => typeof window.__screen.runtime.dataFor(window.__screen.widget(id), 'value').value === 'number',
    kpiId,
  )
  const kpi = await page.evaluate(id => window.__screen.runtime.dataFor(window.__screen.widget(id), 'value'), kpiId)
  assert.equal(kpi.units.value, '%')
  report.widgetBinding = 'PASS'

  // ---------------------------------------------------------------- parameters following a screen variable
  await page.evaluate(() => window.__screen.select([]))
  await page.getByTestId('add-variable').click()
  await page.getByTestId('variable-变量1').locator('input').first().fill('设备')
  await page.getByTestId('variable-变量1').locator('input').first().press('Enter')
  await page.getByTestId('variable-设备').locator('input').nth(1).fill('ESS-002')
  await page.getByTestId('variable-设备').locator('input').nth(1).press('Enter')
  await page.evaluate(() => window.__screen.addWidget('table', { x: 100, y: 600 }))
  await page.getByTestId('inspector-data').click()
  await page.getByTestId('data-source').selectOption('api')
  await page.getByTestId('api-dataset').click()
  await page.getByTestId('api-option-设备历史曲线').click()
  await page.getByTestId('api-param-link-deviceId').click()
  await page.getByTestId('api-param-deviceId').selectOption('设备')
  const tableId = await page.evaluate(() => window.__screen.selection.value[0])
  const requested = id =>
    page.evaluate(i => {
      const s = window.__screen
      return s.runtime.apiState(s.widget(i))?.body?.data?.deviceId
    }, id)
  await page.waitForFunction(
    id => window.__screen.runtime.apiState(window.__screen.widget(id))?.body?.data?.deviceId === 'ESS-002',
    tableId,
  )
  // A click action sets the variable; the table asks again for the new device.
  await page.evaluate(() =>
    window.__screen.runtime.run({ type: 'set-variable', variable: '设备', value: '$item' }, 'ESS-005'),
  )
  await page.waitForFunction(
    id => window.__screen.runtime.apiState(window.__screen.widget(id))?.body?.data?.deviceId === 'ESS-005',
    tableId,
  )
  assert.equal(await requested(tableId), 'ESS-005')
  // Built-in variables: the selected device.
  await page.getByTestId('api-param-deviceId').selectOption('@selectedDeviceId')
  await page.evaluate(() => (window.__screen.runtime.selectedDeviceId.value = 'ESS-007'))
  await page.waitForFunction(
    id => window.__screen.runtime.apiState(window.__screen.widget(id))?.body?.data?.deviceId === 'ESS-007',
    tableId,
  )
  report.variables = 'PASS'

  // ---------------------------------------------------------------- widgets sharing one request
  await page.evaluate(() => {
    const s = window.__screen
    const chart = s.doc.value.widgets.find(w => w.type === 'chart-line')
    s.select([chart.id])
    s.duplicateSelected()
  })
  const shared = await page.evaluate(() => {
    const s = window.__screen
    const charts = s.doc.value.widgets.filter(w => w.type === 'chart-line')
    return charts.map(w => s.runtime.apiRequest(w).key)
  })
  assert.equal(shared.length, 2)
  assert.equal(shared[0], shared[1])
  report.sharedRequests = 'PASS'

  // ---------------------------------------------------------------- an interface that fails shows why
  await page.evaluate(async () => {
    const store = window.__screen.runtime.sources
    const now = new Date().toISOString()
    await store.saveDatasets([
      {
        ...store.datasets[0],
        id: 'ds_missing',
        name: '不存在的接口',
        method: 'GET',
        path: '/api/missing',
        params: [],
        resultPath: 'data',
        resultShape: 'object',
        fields: [{ key: 'v', label: '值', type: 'number' }],
        externalId: undefined,
        createdAt: now,
        updatedAt: now,
      },
    ])
    window.__screen.addWidget('kpi', { x: 1300, y: 600 })
  })
  await page.getByTestId('inspector-data').click()
  await page.getByTestId('data-source').selectOption('api')
  await page.getByTestId('api-dataset').click()
  await page.getByTestId('api-option-不存在的接口').click()
  const problem = page.getByTestId('widget-api-problem').filter({ hasText: '404' })
  await problem.waitFor()
  assert.match(await problem.textContent(), /接口地址不存在/)
  report.errors = 'PASS'

  // ---------------------------------------------------------------- screen files carry interfaces, not secrets
  await page.evaluate(() => window.__screen.save())
  await page.goto(`${base}/screens`)
  const card = page.getByTestId('screen-card-接口大屏')
  await card.locator('button[title="更多"]').click()
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByText('导出 JSON').click()])
  const file = JSON.parse(await readFile(await download.path(), 'utf8'))
  assert(file.interfaces.datasets.length >= 4)
  assert(
    file.interfaces.connections.every(connection => connection.auth.type !== 'bearer' || connection.auth.token === ''),
  )
  assert(!JSON.stringify(file).includes('secret-token'))
  report.exportWithoutSecrets = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
