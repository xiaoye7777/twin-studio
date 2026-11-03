// 浏览器测试：真实走一遍两个园区之间的切换。node scripts/e2e.mjs --only globe
// SHOTS=目录 时把每个阶段截图，并打印帧间隔。
import assert from 'node:assert/strict'
import { launch, settled, waitForStudio } from '../../../apps/editor/tests/helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const { page, errors, close } = await launch()
const shot = name => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }) : null)
const report = {}

const flightClock = () =>
  page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="globe-flight"]')
    return overlay ? { phase: overlay.dataset.phase, clock: Number(overlay.dataset.clock) } : null
  })

try {
  await page.goto(`${base}/projects`)
  await page.getByTestId('create-demo').click()
  await page.getByTestId('create-demo-park').click()
  await page.waitForURL(/\/editor\//, { timeout: 90000 })
  const parkId = page.url().split('/editor/')[1]
  await waitForStudio(page)
  await page.goto(`${base}/projects`)
  await page.getByTestId('create-demo').click()
  await page.getByTestId('create-demo-storage').click()
  await page.waitForURL(/\/editor\/storage-station-/, { timeout: 90000 })
  const stationId = page.url().split('/editor/')[1]
  await waitForStudio(page)
  await settled(page)

  // 入口只在预览模式出现
  assert.equal(await page.getByTestId('globe-switch').isVisible(), false)
  await page.getByTestId('mode-preview').click()
  await page.waitForSelector('.studio.is-preview')
  const toggle = page.getByTestId('globe-switch')
  await toggle.waitFor({ state: 'visible' })
  report.entry = 'PASS'

  // 目标没有位置：先弹出选点，城市列表可用
  await page.evaluate(
    ([id]) => localStorage.setItem('twin-studio.globe-locations', JSON.stringify({ [id]: { lat: 36.41, lon: 94.9 } })),
    [stationId],
  )
  await toggle.click()
  await shot('0-menu')
  await page.getByTestId(`globe-target-${parkId}`).click()
  await page.getByTestId('globe-picker').waitFor()
  await page.getByTestId('globe-picker-city').waitFor()
  await page.waitForFunction(() => {
    const confirm = document.querySelector('[data-testid="globe-picker-confirm"]')
    return confirm && confirm.disabled
  })
  await page.getByTestId('globe-picker-city').selectOption('上海')
  await page.waitForTimeout(1000)
  await shot('1-picker')
  assert.match(await page.getByTestId('globe-picker-readout').textContent(), /31\.23°N/)

  // 从点确定开始记录帧间隔，看主线程被场景加载卡了多久
  await page.evaluate(() => {
    window.__gaps = []
    let last = performance.now()
    const tick = now => {
      window.__gaps.push(Math.round(now - last))
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.getByTestId('globe-picker-confirm').click()
  await page.getByTestId('globe-flight').waitFor({ timeout: 20000 })
  report.picker = 'PASS'

  const seen = new Set()
  const started = Date.now()
  const wanted = [
    ['lift', 0.85],
    ['lift', 1.05],
    ['pull', 1.75],
    ['pull', 2.2],
    ['pull', 2.7],
    ['turn', 3.4],
    ['dive', 0.1],
    ['dive', 1.2],
    ['dive', 1.8],
    ['dive', 2.1],
    ['land', 0.3],
    ['land', 0.6],
    ['land', 0.9],
  ]
  let next = 0
  let diveStart = 0
  let landStart = 0
  for (;;) {
    const state = await flightClock()
    if (!state) break
    assert(Date.now() - started < 90000, `飞行超时 ${JSON.stringify(state)}`)
    seen.add(state.phase)
    if (state.phase === 'dive' && !diveStart) diveStart = state.clock
    if (state.phase === 'land' && !landStart) landStart = state.clock
    const [phase, value] = wanted[next] ?? []
    if (phase) {
      const ready =
        phase === 'dive'
          ? state.phase === 'dive' && state.clock >= diveStart + value
          : phase === 'land'
            ? state.phase === 'land' && state.clock >= landStart + value
            : state.clock >= value
      if (ready) {
        await shot(`f${String(next + 2).padStart(2, '0')}-${phase}-${state.clock.toFixed(1)}`)
        next++
      }
    }
    await page.waitForTimeout(30)
  }
  report.seconds = (Date.now() - started) / 1000
  for (const phase of ['lift', 'pull', 'turn', 'land']) assert(seen.has(phase), `经过阶段 ${phase}: ${[...seen]}`)
  report.phases = [...seen].join('>')

  // 落到目标项目，进入预览，相机控制交还
  assert(page.url().endsWith(`/editor/${parkId}`), page.url())
  assert.equal(await page.locator('.studio.is-preview').count(), 1, '目标场景在预览模式')
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => ({
    enabled: window.__studio.engine.isCameraControlsEnabled(),
    position: window.__studio.engine.camera.position.toArray(),
    view: window.__studio.engine.rig.getView().position,
    overlays: document.querySelectorAll('[data-testid="globe-flight"],[data-testid="globe-picker"]').length,
  }))
  assert.equal(after.enabled, true)
  assert.equal(after.overlays, 0)
  after.position.forEach((value, index) => assert(Math.abs(value - after.view[index]) < 0.5, '相机回到控制器位置'))
  await shot('z-landed')
  report.landed = 'PASS'

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('twin-studio.globe-locations')))
  assert.equal(stored[parkId].lat, 31.23)
  const gaps = await page.evaluate(() => window.__gaps)
  report.frames = {
    count: gaps.length,
    over100ms: gaps.filter(gap => gap > 100).length,
    worst: gaps
      .slice()
      .sort((a, b) => b - a)
      .slice(0, 6),
  }

  // 再飞回去：第二次不再问位置
  await page.getByTestId('globe-switch').click()
  await page.getByTestId(`globe-target-${stationId}`).click()
  await page.getByTestId('globe-flight').waitFor({ timeout: 20000 })
  assert.equal(await page.getByTestId('globe-picker').count(), 0)
  await page.getByTestId('globe-flight').waitFor({ state: 'detached', timeout: 90000 })
  assert(page.url().endsWith(`/editor/${stationId}`))
  report.back = 'PASS'

  assert.deepEqual(errors, [], '没有页面错误')

  // 贴图加载失败：不飞了，但切换必须完成，也不能留下覆盖层
  await page.route('**/earth-day*', route => route.abort())
  await page.waitForSelector('.studio.is-preview')
  await page.getByTestId('globe-switch').click()
  await page.getByTestId(`globe-target-${parkId}`).click()
  await page.waitForURL(new RegExp(`/editor/${parkId}$`), { timeout: 20000 })
  assert.equal(await page.locator('[data-testid="globe-flight"]').count(), 0)
  report.fallback = 'PASS'
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
