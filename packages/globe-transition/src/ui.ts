/** 插件自己的一点点界面样式。不依赖项目的组件和主题，摘除时一起带走。 */
export function panel(css: string): HTMLDivElement {
  const element = document.createElement('div')
  element.style.cssText =
    'border:1px solid rgba(255,255,255,.18);background:rgba(16,28,36,.82);color:#eef6f7;' +
    'font:13px/1.35 system-ui,sans-serif;backdrop-filter:blur(10px);' +
    css
  return element
}

export function button(text: string, primary = false): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = text
  element.style.cssText =
    'height:30px;padding:0 14px;border-radius:7px;cursor:pointer;font:500 12px system-ui,sans-serif;' +
    (primary
      ? 'border:0;background:#2dd4bf;color:#04211d'
      : 'border:1px solid rgba(255,255,255,.22);background:transparent;color:#eef6f7')
  return element
}
