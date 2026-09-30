import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const children = new Set()
let shuttingDown = false

function start(command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  children.add(child)
  child.once('exit', code => {
    children.delete(child)
    if (!shuttingDown && code !== 0) shutdown(code ?? 1)
  })
  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(exitCode), 100).unref()
}

// The device simulator stands in for the realtime gateway configured in the project package.
start(process.execPath, [fileURLToPath(new URL('../../../tools/device-simulator/src/server.mjs', import.meta.url))])
const viteArgs = process.argv.slice(2)
start(process.execPath, [
  'node_modules/vite/bin/vite.js',
  ...(viteArgs.length ? viteArgs : ['--host', '127.0.0.1', '--port', '5200']),
])

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
