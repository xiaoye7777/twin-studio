import { basicWidgets } from './basic'
import { chartWidgets } from './charts'
import { extraWidgets } from './extra'
import { registerWidgets } from './registry'

registerWidgets([...basicWidgets, ...chartWidgets, ...extraWidgets])

export * from './registry'
export * from './types'
