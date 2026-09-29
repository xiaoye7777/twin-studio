import { defineStore } from 'pinia'
import { createTwinState } from '@twin-studio/core'
import { useEditorStore } from './editor'

export const useTwinStore = defineStore('twin', () =>
  createTwinState(() => useEditorStore().setDirty(true)),
)
