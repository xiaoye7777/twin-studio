import { formatPoint, type GeoPoint } from './geo'
import { GlobeFlight } from './GlobeFlight'
import type { GlobeHost, GlobeSite } from './host'
import { pickLocation } from './LocationPicker'
import { getLocation, setLocation } from './locations'
import { button, panel } from './ui'

export interface GlobeTransitionOptions {
  /** 当前打开的项目。 */
  projectId: string
  /** 可以切换到的项目。 */
  projects(): readonly GlobeSite[]
  /** 路由跳转到另一个项目；必须让编辑器重新挂载。 */
  openProject(id: string): Promise<unknown>
}

/** 正在飞的那一次。它要活过路由切换，所以放在模块里，不属于任何一个编辑器实例。 */
let activeFlight: GlobeFlight | null = null

async function ensureLocation(site: GlobeSite): Promise<GeoPoint | null> {
  const known = getLocation(site.id)
  if (known) return known
  const picked = await pickLocation(site.name, null)
  if (picked) setLocation(site.id, picked)
  return picked
}

/**
 * 编辑器唯一需要调用的入口：给预览模式加一个「切换园区」按钮。
 * 按钮和菜单都由这里自己创建；如果正有一次飞行在等这个项目，就把场景交给它。
 */
export function attachGlobeTransition(host: GlobeHost, options: GlobeTransitionOptions): void {
  if (activeFlight?.targetId === options.projectId) activeFlight.adopt(host)

  const parent = host.engine.canvas.parentElement!
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'

  const toggle = button('🌐 切换园区')
  toggle.dataset.testid = 'globe-switch'
  toggle.style.cssText =
    'position:absolute;right:16px;bottom:20px;z-index:20;display:none;padding:8px 16px;border:1px solid rgba(255,255,255,.25);' +
    'border-radius:999px;background:rgba(16,28,36,.72);color:#eef6f7;font:500 13px/1.2 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(8px)'
  const menu = panel(
    'position:absolute;right:16px;bottom:64px;z-index:21;display:none;width:280px;max-height:60%;overflow:auto;padding:6px;border-radius:12px',
  )
  menu.dataset.testid = 'globe-menu'
  parent.append(toggle, menu)

  const current = () => options.projects().find(project => project.id === options.projectId)

  const fly = async (target: GlobeSite) => {
    menu.style.display = 'none'
    const origin = current()
    if (!origin) return
    try {
      const from = await ensureLocation(origin)
      if (!from) return
      const to = await ensureLocation(target)
      if (!to) return
      activeFlight = new GlobeFlight({
        host,
        from: { ...origin, point: from },
        to: { ...target, point: to },
        openProject: options.openProject,
      })
      await activeFlight.start()
    } catch {
      // 地球画不出来（贴图、WebGL）也不能耽误切换
      await options.openProject(target.id)
    } finally {
      activeFlight = null
    }
  }

  const row = (title: string, detail: string, action: () => void, testId: string) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.dataset.testid = testId
    item.style.cssText =
      'display:block;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer'
    item.addEventListener('pointerenter', () => (item.style.background = 'rgba(255,255,255,.1)'))
    item.addEventListener('pointerleave', () => (item.style.background = 'transparent'))
    item.addEventListener('click', action)
    const name = document.createElement('div')
    name.textContent = title
    name.style.fontWeight = '500'
    const sub = document.createElement('div')
    sub.textContent = detail
    sub.style.cssText = 'margin-top:2px;font-size:11px;opacity:.62'
    item.append(name, sub)
    return item
  }

  const describe = (id: string) => {
    const point = getLocation(id)
    return point ? formatPoint(point) : '未定位，选中后先在地球上点选'
  }

  const fillMenu = () => {
    const others = options.projects().filter(project => project.id !== options.projectId)
    const rows: HTMLElement[] = others.map(project =>
      row(project.name, describe(project.id), () => void fly(project), `globe-target-${project.id}`),
    )
    if (!others.length) {
      const empty = document.createElement('div')
      empty.textContent = '还没有其他园区'
      empty.style.cssText = 'padding:10px;opacity:.65'
      rows.push(empty)
    }
    const separator = document.createElement('div')
    separator.style.cssText = 'height:1px;margin:6px 4px;background:rgba(255,255,255,.14)'
    const relocate = row(
      '设置当前园区的位置',
      describe(options.projectId),
      () => {
        menu.style.display = 'none'
        const site = current()
        if (!site) return
        void pickLocation(site.name, getLocation(site.id)).then(point => point && setLocation(site.id, point))
      },
      'globe-relocate',
    )
    menu.replaceChildren(...rows, separator, relocate)
  }

  toggle.addEventListener('click', () => {
    const open = menu.style.display === 'none'
    if (open) fillMenu()
    menu.style.display = open ? 'block' : 'none'
  })

  // 只在预览模式出现
  host.engine.onFrame(() => {
    const show = host.ui.mode === 'preview'
    if ((toggle.style.display !== 'none') !== show) toggle.style.display = show ? 'block' : 'none'
    if (!show && menu.style.display !== 'none') menu.style.display = 'none'
  })
}
