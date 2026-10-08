// Twin Studio device simulator: a stand-in for a real IoT gateway. It speaks the same WebSocket
// protocol a production data service would, so dashboards only ever consume live network data.
//
//   node src/server.mjs                         built-in zero-carbon park (ESS-001 … ESS-008)
//   node src/server.mjs --package demo.twin.zip  devices and variables taken from an exported project
//
// Options: --port (TWIN_DATA_PORT, 8787) --host (TWIN_DATA_HOST, 127.0.0.1) --interval ms (1000)
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { unzipSync } from 'fflate'
import { WebSocketServer } from 'ws'

const { values: args } = parseArgs({
  // pnpm forwards a literal "--" separator from `pnpm simulator -- --port …`.
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    package: { type: 'string' },
    port: { type: 'string', default: process.env.TWIN_DATA_PORT || '8787' },
    host: { type: 'string', default: process.env.TWIN_DATA_HOST || '127.0.0.1' },
    interval: { type: 'string', default: '1000' },
  },
})
const port = Number(args.port)
const host = args.host
const intervalMs = Math.max(100, Number(args.interval) || 1000)
const clients = new Set()
let tick = 0

// Built-in park: deterministic values; ESS-003 reaches 75 ℃ for 6 of every 12 ticks to trigger rules.
function zeroCarbonMessage(index) {
  const id = String(index).padStart(3, '0')
  const alarmDemo = index === 3 && tick % 12 < 6
  return {
    deviceId: `ESS-${id}`,
    soc: Math.round((58 + index * 3 + Math.sin((tick + index) / 3) * 7) * 10) / 10,
    temperature: alarmDemo ? 75 : Math.round((35 + index + Math.sin((tick + index) / 2) * 4) * 10) / 10,
    power: Math.round((92 + index * 8 + Math.cos((tick + index) / 3) * 16) * 10) / 10,
    alarm: alarmDemo,
    status: alarmDemo ? 'alarm' : 'running',
  }
}
const zeroCarbonProfile = {
  name: 'zero-carbon-park',
  deviceCount: 8,
  next: () => Array.from({ length: 8 }, (_, i) => zeroCarbonMessage(i + 1)),
}

/** Devices and their variables, merged across bindings, from an exported .twin.zip. */
function readPackageDevices(file) {
  const scene = JSON.parse(new TextDecoder().decode(unzipSync(readFileSync(file))['scene.json']))
  const devices = new Map()
  for (const binding of scene.bindings ?? []) {
    const device = devices.get(binding.device.id) ?? { id: binding.device.id, variables: new Map() }
    for (const variable of binding.variables) device.variables.set(variable.key, variable.dataType)
    devices.set(device.id, device)
  }
  return [...devices.values()]
}

/** Plausible ranges for common variable names (zero-carbon park equipment). */
function numberRange(key) {
  const k = key.toLowerCase()
  if (k === 'soc' || k.includes('stateofcharge') || k === 'load' || k.includes('humidity')) return [20, 95]
  if (k.includes('temp')) return [24, 46]
  if (k.includes('windspeed')) return [3, 14]
  if (k.includes('rotor')) return [8, 18]
  if (k.includes('irradiance')) return [300, 950]
  if (k.includes('voltage')) return [380, 410]
  if (k.includes('current')) return [10, 120]
  if (k.includes('pm25')) return [8, 60]
  if (k.includes('co2')) return [420, 900]
  if (k.includes('occupancy')) return [20, 300]
  if (k.includes('power')) return [60, 260]
  return [0, 100]
}

/** Accumulating meters (energy, carbon) only ever grow. */
const isCounter = key => /energy|carbon/i.test(key)

// Generic generator: smooth random walks per variable; the third device periodically overheats so alarm
// rules have something to show.
function deviceGenerator(devices, name) {
  const walk = new Map()
  const step = (deviceId, key) => {
    const id = `${deviceId}:${key}`
    if (isCounter(key)) {
      const next = (walk.get(id) ?? 800 + Math.random() * 400) + Math.random() * 4
      walk.set(id, next)
      return Math.round(next * 10) / 10
    }
    const [min, max] = numberRange(key)
    const previous = walk.get(id) ?? min + Math.random() * (max - min)
    const next = Math.min(max, Math.max(min, previous + (Math.random() - 0.5) * (max - min) * 0.06))
    walk.set(id, next)
    return Math.round(next * 10) / 10
  }
  return {
    name,
    deviceCount: devices.length,
    next: () =>
      devices.map((device, index) => {
        const overheating = index === 2 && tick % 12 < 6
        const message = { deviceId: device.id }
        for (const [key, dataType] of device.variables) {
          const k = key.toLowerCase()
          if (dataType === 'number') message[key] = overheating && k.includes('temp') ? 75 : step(device.id, key)
          else if (dataType === 'boolean') message[key] = k.includes('alarm') ? overheating : Math.random() < 0.95
          else message[key] = k.includes('status') ? (overheating ? 'alarm' : 'running') : 'online'
        }
        return message
      }),
  }
}

function packageProfile(file) {
  const devices = readPackageDevices(file)
  if (!devices.length) throw new Error(`${file} 中没有设备绑定，无法生成数据`)
  return deviceGenerator(devices, `package:${file}`)
}

/**
 * Clients (the editor and the Viewer SDK) announce the devices they display right after connecting:
 * { "type": "subscribe", "devices": [{ "deviceId": "ESS-001", "variables": [{ "key": "soc", "dataType": "number" }] }] }
 * The simulator then generates data for exactly those devices on that connection, so any project gets
 * live data without exporting a package first. Real gateways may ignore the message.
 */
function subscriptionDevices(message) {
  if (!message || message.type !== 'subscribe' || !Array.isArray(message.devices)) return null
  const devices = new Map()
  for (const entry of message.devices.slice(0, 2000)) {
    if (!entry || typeof entry.deviceId !== 'string' || !entry.deviceId) continue
    const device = devices.get(entry.deviceId) ?? { id: entry.deviceId, variables: new Map() }
    for (const variable of Array.isArray(entry.variables) ? entry.variables : []) {
      if (variable && typeof variable.key === 'string' && ['number', 'boolean', 'string'].includes(variable.dataType))
        device.variables.set(variable.key, variable.dataType)
    }
    devices.set(device.id, device)
  }
  return [...devices.values()]
}

// Relative paths resolve from where the user ran the command (pnpm sets INIT_CWD for workspace scripts).
const profile = args.package
  ? packageProfile(resolve(process.env.INIT_CWD ?? process.cwd(), args.package))
  : zeroCarbonProfile

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.url === '/status') {
    response.end(
      JSON.stringify({ connections: clients.size, tick, profile: profile.name, devices: profile.deviceCount }),
    )
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'not_found' }))
})

const webSocketServer = new WebSocketServer({ server, path: '/realtime' })
webSocketServer.on('connection', socket => {
  clients.add(socket)
  console.log(`[device-simulator] connected (${clients.size})`)
  socket.on('message', data => {
    try {
      const devices = subscriptionDevices(JSON.parse(String(data)))
      if (!devices) return
      socket.generator = devices.length ? deviceGenerator(devices, 'subscription') : null
      console.log(`[device-simulator] subscription: ${devices.length} devices`)
    } catch {
      // Not JSON: ignore, like a real gateway would.
    }
  })
  socket.on('close', () => {
    clients.delete(socket)
    console.log(`[device-simulator] disconnected (${clients.size})`)
  })
})

const timer = setInterval(() => {
  tick += 1
  const payload = JSON.stringify(profile.next())
  for (const socket of clients) {
    if (socket.readyState !== socket.OPEN) continue
    // Subscribed clients get data for their own devices; the built-in profile stays the default.
    socket.send(socket.generator ? JSON.stringify(socket.generator.next()) : payload)
  }
}, intervalMs)

server.listen(port, host, () => {
  console.log(`[device-simulator] ${profile.name} · ${profile.deviceCount} devices · every ${intervalMs} ms`)
  console.log(`[device-simulator] ws://${host}:${port}/realtime`)
  console.log(`[device-simulator] http://${host}:${port}/status`)
})

function shutdown() {
  clearInterval(timer)
  for (const socket of clients) socket.close(1001, 'Server shutting down')
  webSocketServer.close(() => server.close(() => process.exit(0)))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
