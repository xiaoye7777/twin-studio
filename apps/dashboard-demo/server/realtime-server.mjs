import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const port = Number(process.env.TWIN_DATA_PORT || 8787)
const host = process.env.TWIN_DATA_HOST || '127.0.0.1'
const clients = new Set()
let tick = 0

function deviceMessage(index) {
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

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.url === '/status') {
    response.end(JSON.stringify({ connections: clients.size, tick }))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'not_found' }))
})

const webSocketServer = new WebSocketServer({ server, path: '/realtime' })
webSocketServer.on('connection', socket => {
  clients.add(socket)
  console.log(`[twin-data] connected (${clients.size})`)
  socket.on('close', () => {
    clients.delete(socket)
    console.log(`[twin-data] disconnected (${clients.size})`)
  })
})

const timer = setInterval(() => {
  tick += 1
  const payload = JSON.stringify(Array.from({ length: 8 }, (_, index) => deviceMessage(index + 1)))
  for (const socket of clients) if (socket.readyState === socket.OPEN) socket.send(payload)
}, 1000)

server.listen(port, host, () => {
  console.log(`[twin-data] ws://${host}:${port}/realtime`)
  console.log(`[twin-data] http://${host}:${port}/status`)
})

function shutdown() {
  clearInterval(timer)
  for (const socket of clients) socket.close(1001, 'Server shutting down')
  webSocketServer.close(() => server.close(() => process.exit(0)))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
