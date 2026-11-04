import type { SceneNodeV2 } from '@twin-studio/core'
import { useSession } from '@/studio/context'

/**
 * 属性面板改一个对象的属性。
 *
 *   const { patch, commit } = useNodePatch(() => props.node)
 *   patch('primitive', n => void (n.primitive.color = color), 'color')   // 拖动中：同一个 key 合并成一步撤销
 *   commit()                                                             // 松手：结束这一步
 */
export function useNodePatch(node: () => SceneNodeV2) {
  const session = useSession()
  function patch<K extends SceneNodeV2['kind']>(
    kind: K,
    recipe: (target: Extract<SceneNodeV2, { kind: K }>) => void,
    key?: string,
  ): void {
    const current = node()
    if (current.kind !== kind) return
    session.nodes.updateNode(
      current.id,
      target => recipe(target as Extract<SceneNodeV2, { kind: K }>),
      '修改属性',
      key && `${current.id}:${key}`,
    )
  }
  return { patch, commit: () => session.commit() }
}
