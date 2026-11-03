import { CITIES } from './cities'
import { EarthScene } from './EarthScene'
import { formatPoint, toVector, type GeoPoint } from './geo'
import { button, panel } from './ui'

/** 选点时能拉到多近、多远。 */
const NEAREST = 0.18
const FARTHEST = 5
const DRAG_THRESHOLD = 5

/**
 * 全屏地球选点：拖动转地球，滚轮缩放，单击落点，也可以从城市列表里选。
 * 返回选中的位置，取消返回 null。
 */
export async function pickLocation(siteName: string, initial: GeoPoint | null): Promise<GeoPoint | null> {
  const overlay = document.createElement('div')
  overlay.dataset.testid = 'globe-picker'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#02060c;cursor:grab;overflow:hidden'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  const bar = panel(
    'position:absolute;left:50%;bottom:28px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;' +
      'padding:10px 12px 10px 18px;border-radius:12px;max-width:calc(100% - 32px);flex-wrap:wrap;justify-content:center;cursor:default',
  )
  const title = document.createElement('div')
  title.textContent = `在地球上点选「${siteName}」的位置`
  title.style.cssText = 'font-weight:600;font-size:13px'
  const readout = document.createElement('div')
  readout.dataset.testid = 'globe-picker-readout'
  readout.style.cssText = 'font:12px ui-monospace,monospace;opacity:.75;min-width:150px'
  const select = document.createElement('select')
  select.dataset.testid = 'globe-picker-city'
  select.style.cssText =
    'height:30px;padding:0 8px;border:1px solid rgba(255,255,255,.2);border-radius:7px;background:#14232c;color:#eef6f7;font-size:12px'
  select.add(new Option('选择城市…', ''))
  for (const city of CITIES) select.add(new Option(city.name, city.name))
  const cancel = button('取消')
  const confirm = button('确定', true)
  confirm.dataset.testid = 'globe-picker-confirm'
  bar.append(title, readout, select, cancel, confirm)
  overlay.append(canvas, bar)
  document.body.append(overlay)

  const earth = new EarthScene(canvas)
  try {
    await earth.load()
  } catch {
    overlay.remove()
    earth.dispose()
    throw new Error('地球贴图加载失败')
  }

  let chosen = initial
  const view = { lat: initial?.lat ?? 30, lon: initial?.lon ?? 110, altitude: initial ? 1.6 : 3.4 }
  const refresh = () => {
    earth.setRoute(null, chosen)
    readout.textContent = chosen ? formatPoint(chosen) : '尚未选点'
    confirm.disabled = !chosen
    confirm.style.opacity = chosen ? '1' : '.45'
  }
  refresh()

  return new Promise(resolve => {
    let animation = 0
    let last = performance.now()
    const frame = (now: number) => {
      animation = requestAnimationFrame(frame)
      earth.setView(toVector(view), view.altitude)
      earth.render(Math.min((now - last) / 1000, 0.1))
      last = now
    }
    animation = requestAnimationFrame(frame)

    let press: { x: number; y: number; lat: number; lon: number; moved: boolean } | null = null
    canvas.addEventListener('pointerdown', event => {
      press = { x: event.clientX, y: event.clientY, lat: view.lat, lon: view.lon, moved: false }
      canvas.setPointerCapture(event.pointerId)
      overlay.style.cursor = 'grabbing'
    })
    canvas.addEventListener('pointermove', event => {
      if (!press) return
      const dx = event.clientX - press.x
      const dy = event.clientY - press.y
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) press.moved = true
      if (!press.moved) return
      // 拖动一屏高度差不多转过当前能看到的范围，近的时候转得慢
      const degreesPerPixel = (Math.min(view.altitude, 3) * 42) / window.innerHeight
      view.lat = Math.max(-85, Math.min(85, press.lat + dy * degreesPerPixel))
      view.lon = press.lon - dx * degreesPerPixel
    })
    canvas.addEventListener('pointerup', event => {
      overlay.style.cursor = 'grab'
      if (press && !press.moved) {
        const hit = earth.pick(event.clientX, event.clientY)
        if (hit) {
          chosen = hit
          select.value = ''
          refresh()
        }
      }
      press = null
    })
    canvas.addEventListener(
      'wheel',
      event => {
        event.preventDefault()
        view.altitude = Math.max(NEAREST, Math.min(FARTHEST, view.altitude * Math.exp(event.deltaY * 0.0014)))
      },
      { passive: false },
    )
    select.addEventListener('change', () => {
      const city = CITIES.find(item => item.name === select.value)
      if (!city) return
      chosen = { lat: city.lat, lon: city.lon }
      view.lat = city.lat
      view.lon = city.lon
      view.altitude = Math.min(view.altitude, 1.2)
      refresh()
    })
    const close = (result: GeoPoint | null) => {
      cancelAnimationFrame(animation)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      overlay.remove()
      earth.dispose()
      resolve(result)
    }
    const onResize = () => earth.resize()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(null)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    cancel.addEventListener('click', () => close(null))
    confirm.addEventListener('click', () => chosen && close(chosen))
  })
}
