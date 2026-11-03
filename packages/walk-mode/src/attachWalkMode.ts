import { WalkMode, type WalkModeHost } from './WalkMode'

/** 能接上按钮的最小宿主：一个引擎，和一个判断现在能不能进入漫游的条件。 */
export interface WalkModeSession {
  engine: WalkModeHost
  ui: { mode: string }
}

const HINT = 'WASD 移动 · Shift 疾跑 · 空格 跳 · 鼠标看 · 滚轮远近 · F 或双击空格 飞行（空格升 / C 降）· Esc 退出'

function style(element: HTMLElement, css: string): void {
  element.style.cssText = css
}

/**
 * 编辑器唯一需要调用的入口：给预览模式加一个「漫游」按钮。
 * 按钮和提示都由这里自己创建，放在画布旁边，和项目的组件、样式没有关系。
 * 没有清理函数要管：按钮随画布的父元素一起销毁，漫游在画布离开页面时自动退出。
 */
export function attachWalkMode(session: WalkModeSession): WalkMode {
  const { engine } = session
  const parent = engine.canvas.parentElement!
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '🏃 进入漫游'
  button.dataset.testid = 'walk-mode-start'
  style(
    button,
    'position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;display:none;padding:8px 18px;' +
      'border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(16,28,36,.72);color:#eef6f7;' +
      'font:500 13px/1.2 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(8px)',
  )
  const hint = document.createElement('div')
  hint.textContent = HINT
  hint.dataset.testid = 'walk-mode-hint'
  style(
    hint,
    'position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;display:none;max-width:90%;' +
      'padding:7px 16px;border-radius:999px;background:rgba(16,28,36,.66);color:#dfeaec;white-space:nowrap;' +
      'font:12px/1.3 system-ui,sans-serif;pointer-events:none;backdrop-filter:blur(8px);transition:opacity .6s',
  )
  parent.append(button, hint)

  let hideHint = 0
  const walk = new WalkMode(engine, () => {
    window.clearTimeout(hideHint)
    hint.style.display = 'none'
  })
  // 浏览器测试从这里读状态
  ;(engine.canvas as HTMLCanvasElement & { __walkMode?: WalkMode }).__walkMode = walk
  button.addEventListener('click', () => {
    walk.start()
    hint.style.display = 'block'
    hint.style.opacity = '1'
    hideHint = window.setTimeout(() => (hint.style.opacity = '0'), 7000)
  })
  // 只在预览模式出现；退出预览时漫游也一起结束。
  engine.onFrame(() => {
    const preview = session.ui.mode === 'preview'
    if (!preview && walk.active) walk.stop()
    const show = preview && !walk.active
    if ((button.style.display !== 'none') !== show) button.style.display = show ? 'block' : 'none'
  })
  return walk
}
