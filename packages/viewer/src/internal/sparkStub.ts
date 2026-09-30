// Portable packages only contain GLB/HDR, so Meteor3D's Gaussian Splat path is unreachable in the Viewer.
// Aliasing @sparkjsdev/spark here keeps its ~5 MB bundle out of the SDK.
function unsupported(): never {
  throw new Error('Viewer SDK 不支持 Gaussian Splat 资源')
}

export class SparkRenderer {
  constructor() {
    unsupported()
  }
}
export class SplatMesh {
  constructor() {
    unsupported()
  }
}
