import { basicWidgets } from './basic'
import { chartWidgets } from './charts'
import { extraWidgets } from './extra'
import { registerWidgets } from './registry'
import { sceneWidgets } from './scene'

registerWidgets([...sceneWidgets, ...basicWidgets, ...chartWidgets, ...extraWidgets])

export * from './registry'
export * from './types'
