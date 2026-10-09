<script setup lang="ts">
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  Copy,
  Group,
  Replace,
  RotateCcw,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { MODEL_ROOT_PART, type PrimitiveShape, type SceneNodeV2 } from '@twin-studio/core'
import { builtinModels } from '@/editor/builtinModels'
import { useAssetStore } from '@/stores/assets'
import UiColor from '@/components/ui/UiColor.vue'
import UiNumber from '@/components/ui/UiNumber.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { nodeKindLabels, useSession } from '@/studio/context'
import ModelMotion from './ModelMotion.vue'
import PartMaterial from './PartMaterial.vue'
import SurfacePattern from './SurfacePattern.vue'
import { useShell } from '@/studio/shell'

const props = defineProps<{ nodes: SceneNodeV2[] }>()
const session = useSession()
const shell = useShell()
const node = computed(() => (props.nodes.length === 1 ? props.nodes[0]! : null))
const axes = [
  { label: 'X', color: 'var(--s-x)' },
  { label: 'Y', color: 'var(--s-y)' },
  { label: 'Z', color: 'var(--s-z)' },
] as const
const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (value: number) => (value * Math.PI) / 180

function setTransform(part: 'position' | 'rotation' | 'scale', axis: number, value: number): void {
  const n = node.value
  if (!n) return
  session.updateNode(
    n.id,
    target => {
      target.transform[part][axis] = part === 'rotation' ? rad(value) : value
    },
    part === 'position' ? '移动' : part === 'rotation' ? '旋转' : '缩放',
    `transform:${n.id}:${part}:${axis}`,
  )
}

/** Edits one property of the selected node; `live` edits merge into one undo step until `commit`. */
function patch<K extends SceneNodeV2['kind']>(
  kind: K,
  recipe: (target: Extract<SceneNodeV2, { kind: K }>) => void,
  key?: string,
): void {
  const n = node.value
  if (!n || n.kind !== kind) return
  session.updateNode(
    n.id,
    target => recipe(target as Extract<SceneNodeV2, { kind: K }>),
    '修改属性',
    key && `${n.id}:${key}`,
  )
}
const commit = () => session.commit()

const assetStore = useAssetStore()
const assetName = computed(() => {
  const n = node.value
  if (n?.kind !== 'model') return ''
  const file = assetStore.assets.find(asset => asset.id === n.model.assetId)?.name ?? ''
  return builtinModels.find(model => model.file === file)?.name ?? file.replace(/\.glb$/i, '')
})
const partCount = computed(() => {
  void session.ui.syncRevision
  return node.value?.kind === 'model' ? session.sync.partsOf(node.value.id).length : 0
})
const modelEdits = computed(() => {
  const n = node.value
  if (n?.kind !== 'model') return { overrides: 0, deleted: 0 }
  const parts = Object.keys(n.model.overrides).filter(id => id !== MODEL_ROOT_PART)
  return { overrides: parts.length, deleted: n.model.deleted.length }
})
const childCount = computed(() => session.doc.value.nodes.filter(item => item.parentId === node.value?.id).length)

const shapeOptions: Array<{ value: PrimitiveShape; label: string }> = [
  { value: 'box', label: '立方' },
  { value: 'plane', label: '平面' },
  { value: 'cylinder', label: '圆柱' },
  { value: 'sphere', label: '球' },
  { value: 'cone', label: '锥' },
]

const allVisible = computed(() => props.nodes.every(item => item.visible))
const allLocked = computed(() => props.nodes.every(item => item.locked))
</script>

<template>
  <div class="props" data-testid="node-properties">
    <!-- Identity -->
    <div v-if="node" class="props__identity">
      <UiText
        :model-value="node.name"
        placeholder="名称"
        data-testid="node-name"
        @commit="session.rename(node.id, $event)"
      />
      <span class="s-badge">{{ nodeKindLabels[node.kind] }}</span>
    </div>

    <!-- Transform -->
    <UiSection v-if="node" title="变换">
      <template #actions>
        <button
          class="s-icon-btn"
          title="重置变换"
          @click="
            session.updateNode(
              node.id,
              n => void (n.transform = { position: n.transform.position, rotation: [0, 0, 0], scale: [1, 1, 1] }),
              '重置变换',
            )
          "
        >
          <RotateCcw :size="13" />
        </button>
      </template>
      <UiRow label="位置">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="node.transform.position[index]!"
          :step="0.1"
          :precision="3"
          :data-testid="`position-${axis.label.toLowerCase()}`"
          @update="setTransform('position', index, $event)"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="旋转">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="deg(node.transform.rotation[index]!)"
          :step="1"
          :precision="1"
          unit="°"
          @update="setTransform('rotation', index, $event)"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="缩放">
        <UiNumber
          v-for="(axis, index) in axes"
          :key="axis.label"
          :label="axis.label"
          :label-color="axis.color"
          :model-value="node.transform.scale[index]!"
          :step="0.01"
          :precision="3"
          @update="setTransform('scale', index, $event)"
          @commit="commit"
        />
      </UiRow>
    </UiSection>

    <!-- Multi-selection tools -->
    <UiSection v-if="nodes.length > 1" title="对齐与分布">
      <div class="props__tools">
        <button class="s-icon-btn" title="左对齐（X 最小）" @click="session.align(0, 'min')">
          <AlignStartVertical :size="15" />
        </button>
        <button class="s-icon-btn" title="X 居中" @click="session.align(0, 'center')">
          <AlignCenterVertical :size="15" />
        </button>
        <button class="s-icon-btn" title="右对齐（X 最大）" @click="session.align(0, 'max')">
          <AlignEndVertical :size="15" />
        </button>
        <span class="props__tools-sep" />
        <button class="s-icon-btn" title="前对齐（Z 最小）" @click="session.align(2, 'min')">
          <AlignStartHorizontal :size="15" />
        </button>
        <button class="s-icon-btn" title="Z 居中" @click="session.align(2, 'center')">
          <AlignCenterHorizontal :size="15" />
        </button>
        <button class="s-icon-btn" title="后对齐（Z 最大）" @click="session.align(2, 'max')">
          <AlignEndHorizontal :size="15" />
        </button>
        <span class="props__tools-sep" />
        <button class="s-icon-btn" title="沿 X 均匀分布" @click="session.distribute(0)">
          <AlignHorizontalDistributeCenter :size="15" />
        </button>
        <button class="s-icon-btn" title="沿 Z 均匀分布" @click="session.distribute(2)">
          <AlignVerticalDistributeCenter :size="15" />
        </button>
      </div>
      <div class="props__buttons">
        <button class="s-btn" @click="session.dropToGround()"><ArrowDownToLine :size="13" />放到地面</button>
        <button class="s-btn" @click="session.groupSelection()"><Group :size="13" />组合</button>
        <button class="s-btn" @click="shell.dialog = 'array'"><Copy :size="13" />阵列</button>
      </div>
      <p class="props__note s-hint">批量绑定设备：切换到「数据」页签。</p>
    </UiSection>

    <!-- Display -->
    <UiSection title="显示">
      <UiRow label="可见">
        <UiSwitch :model-value="allVisible" @update:model-value="session.setVisible(session.selection.value, $event)" />
      </UiRow>
      <UiRow label="锁定" hint="锁定后无法在视口中选中或移动">
        <UiSwitch :model-value="allLocked" @update:model-value="session.setLocked(session.selection.value, $event)" />
      </UiRow>
      <div v-if="node" class="props__buttons">
        <button class="s-btn" @click="session.dropToGround()"><ArrowDownToLine :size="13" />放到地面</button>
        <button class="s-btn" @click="shell.dialog = 'array'"><Copy :size="13" />阵列复制</button>
      </div>
    </UiSection>

    <!-- Kind-specific -->
    <template v-if="node?.kind === 'model'">
      <UiSection title="模型">
        <UiRow label="资源">
          <span class="props__value" data-testid="model-asset">{{ assetName }}</span>
          <button
            class="s-btn s-btn--sm"
            title="换成另一个模型或新版本"
            data-testid="replace-model"
            @click="shell.dialog = 'replace-model'"
          >
            <Replace :size="12" />替换
          </button>
        </UiRow>
        <UiRow label="部件"
          ><span class="props__value" :title="'再次单击模型或双击，选中其中的部件'"
            >{{ partCount }} 个 · {{ modelEdits.overrides }} 处修改 · {{ modelEdits.deleted }} 个已删除</span
          ></UiRow
        >
        <p class="props__note s-hint">再次单击模型（或双击）选中其中的部件，可单独绑定设备、改材质、隐藏。</p>
        <div v-if="modelEdits.overrides || modelEdits.deleted" class="props__buttons">
          <button v-if="modelEdits.deleted" class="s-btn" @click="session.restoreDeletedParts(node.id)">
            <RotateCcw :size="13" />恢复删除的部件
          </button>
          <button
            class="s-btn"
            @click="
              patch('model', n => {
                n.model.overrides = {}
                n.model.deleted = []
              })
            "
          >
            <RotateCcw :size="13" />恢复原始模型
          </button>
        </div>
      </UiSection>
      <PartMaterial :node-id="node.id" :asset-node-id="MODEL_ROOT_PART" title="整体材质" />
      <ModelMotion :node="node" />
    </template>

    <template v-else-if="node?.kind === 'primitive'">
      <UiSection title="几何体">
        <UiRow label="形状">
          <UiSegmented
            :model-value="node.primitive.shape"
            :options="shapeOptions"
            @update:model-value="patch('primitive', n => void (n.primitive.shape = $event))"
          />
        </UiRow>
        <UiRow v-if="['box', 'plane'].includes(node.primitive.shape)" label="宽 × 长">
          <UiNumber
            label="W"
            :model-value="node.primitive.width ?? 4"
            :min="0.01"
            @update="patch('primitive', n => void (n.primitive.width = $event), 'width')"
            @commit="commit"
          />
          <UiNumber
            :label="node.primitive.shape === 'plane' ? 'L' : 'D'"
            :model-value="(node.primitive.shape === 'plane' ? node.primitive.height : node.primitive.depth) ?? 4"
            :min="0.01"
            @update="
              patch(
                'primitive',
                n => {
                  if (n.primitive.shape === 'plane') n.primitive.height = $event
                  else n.primitive.depth = $event
                },
                'depth',
              )
            "
            @commit="commit"
          />
        </UiRow>
        <UiRow v-if="['box', 'cylinder', 'cone'].includes(node.primitive.shape)" label="高度">
          <UiNumber
            :model-value="node.primitive.height ?? 3"
            :min="0.01"
            unit="m"
            @update="patch('primitive', n => void (n.primitive.height = $event), 'height')"
            @commit="commit"
          />
        </UiRow>
        <UiRow v-if="['cylinder', 'sphere', 'cone'].includes(node.primitive.shape)" label="半径">
          <UiNumber
            :model-value="
              (node.primitive.shape === 'cone' ? node.primitive.radiusBottom : node.primitive.radiusTop) ?? 1.5
            "
            :min="0.01"
            unit="m"
            @update="
              patch(
                'primitive',
                n => {
                  if (n.primitive.shape === 'cone') n.primitive.radiusBottom = $event
                  else {
                    n.primitive.radiusTop = $event
                    if (n.primitive.shape === 'cylinder') n.primitive.radiusBottom = $event
                  }
                },
                'radius',
              )
            "
            @commit="commit"
          />
        </UiRow>
      </UiSection>
      <UiSection title="材质">
        <UiRow label="颜色">
          <UiColor
            :model-value="node.primitive.color"
            @update="patch('primitive', n => void (n.primitive.color = $event), 'color')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="不透明度">
          <UiSlider
            :model-value="node.primitive.opacity ?? 1"
            :min="0"
            :max="1"
            @update="patch('primitive', n => void (n.primitive.opacity = $event), 'opacity')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="自发光" hint="夜景下配合泛光效果最明显">
          <UiSlider
            :model-value="node.primitive.emissive ?? 0"
            :min="0"
            :max="1"
            @update="patch('primitive', n => void (n.primitive.emissive = $event), 'emissive')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="金属度">
          <UiSlider
            :model-value="node.primitive.metalness ?? 0.1"
            :min="0"
            :max="1"
            @update="patch('primitive', n => void (n.primitive.metalness = $event), 'metalness')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="粗糙度">
          <UiSlider
            :model-value="node.primitive.roughness ?? 0.6"
            :min="0"
            :max="1"
            @update="patch('primitive', n => void (n.primitive.roughness = $event), 'roughness')"
            @commit="commit"
          />
        </UiRow>
        <SurfacePattern
          :pattern="node.primitive.pattern"
          @update="(pattern, key) => patch('primitive', n => void (n.primitive.pattern = pattern), key)"
          @commit="commit"
        />
      </UiSection>
    </template>

    <template v-else-if="node?.kind === 'path'">
      <UiSection title="能流线">
        <UiRow label="样式">
          <UiSegmented
            :model-value="node.path.style"
            :options="[
              { value: 'flow', label: '流光管线' },
              { value: 'line', label: '地面流向' },
              { value: 'tube', label: '实体管道' },
            ]"
            @update:model-value="patch('path', n => void (n.path.style = $event))"
          />
        </UiRow>
        <UiRow label="颜色">
          <UiColor
            :model-value="node.path.color"
            @update="patch('path', n => void (n.path.color = $event), 'color')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="宽度">
          <UiSlider
            :model-value="node.path.width"
            :min="0.05"
            :max="10"
            :step="0.05"
            unit="m"
            @update="patch('path', n => void (n.path.width = $event), 'width')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="流速" hint="负值表示反向流动">
          <UiSlider
            :model-value="node.path.speed"
            :min="-10"
            :max="10"
            :step="0.1"
            @update="patch('path', n => void (n.path.speed = $event), 'speed')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="不透明度">
          <UiSlider
            :model-value="node.path.opacity"
            :min="0"
            :max="1"
            @update="patch('path', n => void (n.path.opacity = $event), 'opacity')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="闭合">
          <UiSwitch
            :model-value="node.path.closed"
            @update:model-value="patch('path', n => void (n.path.closed = $event))"
          />
        </UiRow>
        <UiRow label="路径点"
          ><span class="props__value">{{ node.path.points.length }} 个点</span></UiRow
        >
      </UiSection>
    </template>

    <template v-else-if="node?.kind === 'area'">
      <UiSection title="区域">
        <UiRow label="名称标注">
          <UiText
            :model-value="node.area.label"
            placeholder="区域中央显示的文字"
            @commit="patch('area', n => void (n.area.label = $event))"
          />
        </UiRow>
        <UiRow label="颜色">
          <UiColor
            :model-value="node.area.color"
            @update="patch('area', n => void (n.area.color = $event), 'color')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="不透明度">
          <UiSlider
            :model-value="node.area.opacity"
            :min="0"
            :max="1"
            @update="patch('area', n => void (n.area.opacity = $event), 'opacity')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="光墙高度">
          <UiSlider
            :model-value="node.area.wallHeight"
            :min="0"
            :max="30"
            :step="0.5"
            unit="m"
            @update="patch('area', n => void (n.area.wallHeight = $event), 'wall')"
            @commit="commit"
          />
        </UiRow>
        <SurfacePattern
          :pattern="node.area.pattern"
          @update="(pattern, key) => patch('area', n => void (n.area.pattern = pattern), key)"
          @commit="commit"
        />
        <UiRow label="顶点"
          ><span class="props__value">{{ node.area.points.length }} 个顶点</span></UiRow
        >
      </UiSection>
    </template>

    <template v-else-if="node?.kind === 'label'">
      <UiSection title="标签">
        <UiRow label="文字" stack>
          <UiText
            :model-value="node.label.text"
            multiline
            @commit="patch('label', n => void (n.label.text = $event))"
          />
        </UiRow>
        <UiRow label="样式">
          <UiSegmented
            :model-value="node.label.style"
            :options="[
              { value: 'tag', label: '标牌' },
              { value: 'title', label: '大标题' },
              { value: 'pin', label: '气泡' },
            ]"
            @update:model-value="patch('label', n => void (n.label.style = $event))"
          />
        </UiRow>
        <UiRow label="文字色">
          <UiColor
            :model-value="node.label.color"
            @update="patch('label', n => void (n.label.color = $event), 'color')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="底色">
          <UiColor
            :model-value="node.label.background"
            @update="patch('label', n => void (n.label.background = $event), 'bg')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="大小">
          <UiSlider
            :model-value="node.label.size"
            :min="0.3"
            :max="4"
            :step="0.05"
            @update="patch('label', n => void (n.label.size = $event), 'size')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="引线">
          <UiSwitch
            :model-value="node.label.leader"
            @update:model-value="patch('label', n => void (n.label.leader = $event))"
          />
        </UiRow>
      </UiSection>
    </template>

    <template v-else-if="node?.kind === 'light'">
      <UiSection title="灯光">
        <UiRow label="类型">
          <UiSegmented
            :model-value="node.light.type"
            :options="[
              { value: 'point', label: '点光源' },
              { value: 'spot', label: '聚光灯' },
            ]"
            @update:model-value="patch('light', n => void (n.light.type = $event))"
          />
        </UiRow>
        <UiRow label="颜色">
          <UiColor
            :model-value="node.light.color"
            @update="patch('light', n => void (n.light.color = $event), 'color')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="强度">
          <UiSlider
            :model-value="node.light.intensity"
            :min="0"
            :max="2000"
            :step="10"
            :precision="0"
            @update="patch('light', n => void (n.light.intensity = $event), 'intensity')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="照射距离">
          <UiSlider
            :model-value="node.light.distance"
            :min="0"
            :max="200"
            :step="1"
            :precision="0"
            unit="m"
            @update="patch('light', n => void (n.light.distance = $event), 'distance')"
            @commit="commit"
          />
        </UiRow>
        <UiRow v-if="node.light.type === 'spot'" label="光锥角度">
          <UiSlider
            :model-value="node.light.angle"
            :min="5"
            :max="85"
            :step="1"
            :precision="0"
            unit="°"
            @update="patch('light', n => void (n.light.angle = $event), 'angle')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="投射阴影" hint="开销较大，建议只给关键灯光开启">
          <UiSwitch
            :model-value="node.light.castShadow"
            @update:model-value="patch('light', n => void (n.light.castShadow = $event))"
          />
        </UiRow>
      </UiSection>
    </template>

    <template v-else-if="node?.kind === 'group'">
      <UiSection title="分组">
        <UiRow label="成员"
          ><span class="props__value">{{ childCount }} 个对象</span></UiRow
        >
        <p class="props__note s-hint">分组可作为图层：在导览步骤或交互中整体显示 / 隐藏，大屏也可通过 SDK 控制显隐。</p>
        <div class="props__buttons">
          <button class="s-btn" @click="session.ungroupSelection()">取消组合</button>
        </div>
      </UiSection>
    </template>
  </div>
</template>

<style scoped>
.props__identity {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--s-line);
}
.props__value {
  overflow: hidden;
  color: var(--s-fg-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.props__tools {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0 10px 6px;
}
.props__tools-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--s-line-2);
}
.props__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 12px 2px;
}
.props__note {
  margin: 4px 0 0;
  padding: 0 12px;
}
</style>
