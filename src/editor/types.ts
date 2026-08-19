import type { Object3D } from 'three'

export interface SceneTreeNode {
  id: string
  bid?: string
  name: string
  type: string
  object: Object3D
  children: SceneTreeNode[]
}

export interface Vector3FormValue {
  x: number
  y: number
  z: number
}

export interface InspectorFormState {
  name: string
  position: Vector3FormValue
  rotation: Vector3FormValue
  scale: Vector3FormValue
}
