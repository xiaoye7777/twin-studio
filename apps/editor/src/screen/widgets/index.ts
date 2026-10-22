import { basicWidgets } from './basic'
import { registerWidgets } from './registry'

registerWidgets([...basicWidgets])

export * from './registry'
export * from './types'
