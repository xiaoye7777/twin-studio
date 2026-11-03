// 浏览器测试：在储能电站案例里真实按键走、跑、跳、飞。node scripts/e2e.mjs --only walk
// SHOTS=目录 时顺便把各个状态截图。
import assert from 'node:assert/strict'
import { launch, settled, waitForStudio } from '../../../apps/editor/tests/helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const { page, errors, close } = await launch()
const report = {}
const shot = name => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }) : null)
const state = () =>
  page.evaluate(() => {
    const walk = document.querySelector('canvas').__walkMode
    const s = walk.state
    return s
      ? {
          active: walk.active,
          x: s.position.x,
          y: s.position.y,
          z: s.position.z,
          speed: s.horizontalSpeed,
          vy: s.velocity.y,
          grounded: s.grounded,
          flying: s.flying,
        }
      : { active: walk.active }
  })

try {
  await page.goto(`${base}/projects`)
  await page.getByTestId('create-demo').click()
  await page.getByTestId('create-demo-storage').click()
  await page.waitForURL(/\/editor\/storage-station-/, { timeout: 90000 })
  await waitForStudio(page)
  await settled(page)
  // 按钮只在预览模式出现
  assert.equal(await page.locator('[data-testid="walk-mode-start"]').isVisible(), false)
  await page.getByTestId('mode-preview').click()
  await page.waitForSelector('.studio.is-preview')
  const start = page.locator('[data-testid="walk-mode-start"]')
  await start.waitFor({ state: 'visible' })
  await shot('0-button')
  const before = await page.evaluate(
    () => document.querySelector('canvas').__walkMode && window.__studio.engine.scene.children.length,
  )
  await start.click()
  await page.waitForTimeout(800)
  let s = await state()
  assert(s.active && s.grounded, `站在地面上 ${JSON.stringify(s)}`)
  await shot('1-idle')
  report.spawn = 'PASS'

  // 走：W 向前，速度接近步行
  await page.keyboard.down('KeyW')
  const moved = await state()
  await page.waitForFunction(() => document.querySelector('canvas').__walkMode.state.horizontalSpeed > 4, null, {
    timeout: 8000,
  })
  await page.waitForTimeout(300)
  const walking = await state()
  void moved
  assert(Math.hypot(walking.x - s.x, walking.z - s.z) > 1, '走出去了')
  await shot('2-walk')
  // 疾跑
  await page.keyboard.down('ShiftLeft')
  await page.waitForFunction(() => document.querySelector('canvas').__walkMode.state.horizontalSpeed > 7, null, {
    timeout: 8000,
  })
  const sprinting = await state()
  assert(sprinting.speed > walking.speed + 1.5, `疾跑 ${sprinting.speed}`)
  await shot('3-sprint')
  await page.keyboard.up('ShiftLeft')
  await page.keyboard.up('KeyW')
  await page.waitForFunction(() => document.querySelector('canvas').__walkMode.state.horizontalSpeed < 0.5, null, {
    timeout: 5000,
  })
  s = await state()
  report.walkAndSprint = 'PASS'

  // 跳
  const groundY = s.y
  await page.keyboard.down('Space')
  await page.waitForTimeout(250)
  const air = await state()
  assert(air.y > groundY + 0.5 && !air.grounded, `跳起 ${air.y}`)
  await shot('4-jump')
  await page.keyboard.up('Space')
  await page.waitForTimeout(1200)
  s = await state()
  assert(s.grounded && Math.abs(s.y - groundY) < 0.05, '落回地面')
  report.jump = 'PASS'

  // 飞：F 起飞，空格上升
  await page.keyboard.press('KeyF')
  await page.keyboard.down('Space')
  await page.waitForTimeout(1500)
  await page.keyboard.up('Space')
  const flying = await state()
  assert(flying.flying && flying.y > groundY + 4, `飞起 ${flying.y}`)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1200)
  await shot('5-fly')
  await page.keyboard.up('KeyW')
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(2500)
  s = await state()
  assert(!s.flying && s.grounded, `关闭飞行后落地 ${JSON.stringify(s)}`)
  report.fly = 'PASS'

  // 墙：朝储能柜方向一直走不会穿过去（走到被挡住，速度降下来或沿墙滑开）
  // 退出：完整还原，场景里不留东西
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('canvas').__walkMode.active)
  const after = await page.evaluate(() => window.__studio.engine.scene.children.length)
  assert.equal(after, before)
  assert(await page.evaluate(() => window.__studio.engine.isCameraControlsEnabled()), '相机控制还回去了')
  assert.equal(await page.evaluate(() => window.__studio.ui.mode), 'preview')
  await start.waitFor({ state: 'visible' })
  report.exit = 'PASS'

  assert.deepEqual(errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await close()
}
