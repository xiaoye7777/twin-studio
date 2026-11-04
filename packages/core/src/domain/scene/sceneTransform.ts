import type { Object3D } from 'three'
import type { SceneTransformV1 } from './sceneTypes'

export function serializeTransform(object: Object3D): SceneTransformV1 {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  }
}

export function applySceneTransform(object: Object3D, transform: SceneTransformV1): void {
  object.position.fromArray(transform.position)
  object.rotation.fromArray([...transform.rotation, object.rotation.order])
  object.scale.fromArray(transform.scale)
  object.updateMatrix()
  object.updateMatrixWorld(true)
}
