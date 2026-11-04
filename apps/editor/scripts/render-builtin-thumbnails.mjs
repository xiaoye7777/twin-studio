// 重新生成内置模型的缩略图（public/demo-assets/thumbs/*.webp）。新增内置模型后运行一次，已有的图不会重画。
// 先启动编辑器的开发服务器，再运行（没装 Playwright 的 Chromium 时用 CHROME_PATH 指定本机 Chrome）：
// TEST_BASE_URL=http://127.0.0.1:5173 node scripts/render-builtin-thumbnails.mjs
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { launch } from '../tests/helpers.mjs'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const assets = fileURLToPath(new URL('../public/demo-assets/', import.meta.url))
const thumbs = `${assets}thumbs/`
await mkdir(thumbs, { recursive: true })

const models = (await readdir(assets)).filter(
  name => name.endsWith('.glb') && !existsSync(`${thumbs}${name.replace(/\.glb$/, '.webp')}`),
)
const { page, close } = await launch()
try {
  await page.goto(`${base}/projects`)
  for (const name of models) {
    // 用编辑器自己的缩略图渲染器，和导入模型的缩略图是同一种观感。
    const image = await page.evaluate(async file => {
      const { modelThumbnail } = await import('/src/studio/modelThumbnails.ts')
      return modelThumbnail(`render:${file}`, `/demo-assets/${file}`)
    }, name)
    if (!image) throw new Error(`缩略图渲染失败：${name}`)
    const file = `${thumbs}${name.replace(/\.glb$/, '.webp')}`
    await writeFile(file, Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'))
    console.log(name)
  }
  console.log(`已生成 ${models.length} 张缩略图`)
} finally {
  await close()
}
