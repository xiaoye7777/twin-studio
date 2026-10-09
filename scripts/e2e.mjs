// Browser end-to-end suites in one command: `pnpm test:e2e`.
// Builds the Viewer SDK, starts the Editor, the dashboard demo and the device simulator on free ports,
// runs every suite in order and always stops the servers. `--only <name>` runs a single suite.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
// pnpm forwards a literal "--" from `pnpm test:e2e -- --only editor`.
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: { only: { type: 'string' } },
})
const children = new Set()

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
      .once('error', reject)
      .listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        server.close(() => resolve(port))
      })
  })
}

function start(label, command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options })
  let output = ''
  const collect = chunk => {
    output = (output + chunk).slice(-4000)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.once('exit', code => {
    if (children.has(child) && code !== null && code !== 0) console.error(`[e2e] ${label} exited (${code})\n${output}`)
    children.delete(child)
  })
  children.add(child)
  return child
}

function run(label, command, commandArgs, env = {}, cwd = root) {
  return new Promise(resolve => {
    console.log(`\n[e2e] ▶ ${label}`)
    const started = Date.now()
    const child = spawn(command, commandArgs, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
    child.once('exit', code => {
      console.log(`[e2e] ${code === 0 ? '✔' : '✘'} ${label} (${((Date.now() - started) / 1000).toFixed(0)}s)`)
      resolve(code === 0)
    })
  })
}

async function waitFor(url, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${label} did not respond at ${url} within ${timeoutMs / 1000}s`)
}

function stopAll() {
  for (const child of children) child.kill('SIGTERM')
  children.clear()
}
process.on('SIGINT', () => {
  stopAll()
  process.exit(130)
})

// Use a local Chrome when available; CI installs Playwright's Chromium instead.
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chromePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined)
const browserEnv = chromePath ? { CHROME_PATH: chromePath } : {}

let ok = false
try {
  // The dashboard demo consumes the SDK's dist, exactly like an external host.
  const viewerDir = `${root}packages/viewer`
  if (!(await run('build Viewer SDK', process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {}, viewerDir))) {
    throw new Error('Viewer SDK build failed')
  }
  const [editorPort, dashboardPort, dataPort] = await Promise.all([freePort(), freePort(), freePort()])
  const vite = () => ['node_modules/vite/bin/vite.js']
  start('editor', process.execPath, [...vite(), '--host', '127.0.0.1', '--port', String(editorPort), '--strictPort'], {
    cwd: `${root}apps/editor`,
  })
  start(
    'dashboard',
    process.execPath,
    [...vite(), '--host', '127.0.0.1', '--port', String(dashboardPort), '--strictPort'],
    { cwd: `${root}apps/dashboard-demo` },
  )
  start('simulator', process.execPath, ['tools/device-simulator/src/server.mjs', '--port', String(dataPort)])
  const editor = `http://127.0.0.1:${editorPort}`
  const dashboard = `http://127.0.0.1:${dashboardPort}`
  await Promise.all([
    waitFor(`${editor}/projects`, 'editor'),
    waitFor(`${dashboard}/`, 'dashboard'),
    waitFor(`http://127.0.0.1:${dataPort}/status`, 'simulator'),
  ])
  console.log(`[e2e] editor ${editor} · dashboard ${dashboard} · simulator :${dataPort}`)

  const suites = [
    ['editor', 'apps/editor/tests/studio.mjs', { TEST_BASE_URL: editor }],
    ['demo', 'apps/editor/tests/zero-carbon-demo.mjs', { TEST_BASE_URL: editor, TWIN_DATA_PORT: String(dataPort) }],
    [
      'dashboard',
      'apps/dashboard-demo/tests/project-data-source.mjs',
      { EDITOR_URL: editor, TEST_BASE_URL: dashboard, TWIN_DATA_PORT: String(dataPort) },
    ],
  ].filter(([name]) => !args.only || args.only === name)
  if (!suites.length) throw new Error(`unknown suite "${args.only}" (editor | demo | dashboard)`)

  const results = []
  for (const [name, file, env] of suites)
    results.push([name, await run(`${name} suite`, process.execPath, [file], { ...browserEnv, ...env })])
  console.log(`\n[e2e] ${results.map(([name, passed]) => `${passed ? '✔' : '✘'} ${name}`).join('  ')}`)
  ok = results.every(([, passed]) => passed)
} catch (error) {
  console.error(`[e2e] ${error instanceof Error ? error.message : String(error)}`)
} finally {
  stopAll()
}
process.exit(ok ? 0 : 1)
