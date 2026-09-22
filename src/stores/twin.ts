import { defineStore } from 'pinia'
import { createTwinState } from '@/runtime/twin/createTwinState'
import { useEditorStore } from './editor'

export const useTwinStore = defineStore('twin', () =>
  createTwinState(() => useEditorStore().setDirty(true)),
)
