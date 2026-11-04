import { basicWidgets } from './basic'
import { chartWidgets } from './charts'
import { extraWidgets } from './extra'
import { filterWidgets } from './filters'
import { registerWidgets } from './registry'
import { sceneWidgets } from './scene'

registerWidgets([...sceneWidgets, ...basicWidgets, ...chartWidgets, ...extraWidgets, ...filterWidgets])

export * from './registry'
export * from './types'
