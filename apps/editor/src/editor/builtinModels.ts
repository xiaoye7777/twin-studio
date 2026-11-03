import {
  type AnimationPlayMode,
  type AssetRecord,
  type AssetRepository,
  type InteractionTrigger,
  validatePortableAsset,
} from '@twin-studio/core'

export type BuiltinModelCategory = '储能' | '新能源' | '电力' | '建筑' | '工业' | '物流' | '园区' | '绿化'

export interface BuiltinModel {
  key: string
  /** File in public/demo-assets; also the asset name, so repeated imports de-duplicate by fingerprint. */
  file: string
  name: string
  category: BuiltinModelCategory
  description: string
  /** 放进场景时的缩放。新模型本身就是真实米制（不填）；最早的 Kenney 模型只有一两个单位大，要放大才和它们同一比例。 */
  scale?: number
  /** 放进场景时预设的交互：触发方式和要播放的动画片段，可以在「交互」面板里改或删。 */
  interactions?: Array<{ trigger: InteractionTrigger; clip: string; mode: AnimationPlayMode }>
}

/** Models bundled with the editor: CC0 downloads and our own; author and source of each one are in public/demo-assets/CREDITS.md. */
export const builtinModels: readonly BuiltinModel[] = [
  // 储能
  {
    key: 'essCabinet',
    file: 'ess-cabinet.glb',
    name: '储能柜（可拆解）',
    category: '储能',
    description: '工商业一体柜：内含电池包、电芯、变流器和消防。预览时单击开关门，双击爆炸和复位',
    interactions: [
      { trigger: 'click', clip: 'Doors_Open', mode: 'toggle' },
      { trigger: 'double-click', clip: 'Explode', mode: 'toggle' },
    ],
  },
  {
    key: 'container',
    file: 'energy-storage-container.glb',
    name: '储能集装箱',
    category: '储能',
    description: '集装箱式储能单元',
    scale: 7.4,
  },
  {
    key: 'tank',
    file: 'thermal-storage-tank.glb',
    name: '储热罐',
    category: '储能',
    description: '热储能设施',
    scale: 8,
  },
  { key: 'waterTank', file: 'water-tank.glb', name: '储水罐', category: '储能', description: '冷热水蓄能、消防水罐' },
  // 新能源
  {
    key: 'solar',
    file: 'solar-array.glb',
    name: '光伏阵列',
    category: '新能源',
    description: '地面光伏组件',
    scale: 5,
  },
  {
    key: 'turbine',
    file: 'wind-turbine.glb',
    name: '风力发电机',
    category: '新能源',
    description: '含独立叶片节点',
    scale: 20,
  },
  {
    key: 'pvGround',
    file: 'pv-module-ground.glb',
    name: '地面光伏组件',
    category: '新能源',
    description: '单组地面光伏板',
  },
  {
    key: 'pvTilted',
    file: 'pv-module-tilted.glb',
    name: '支架光伏组件',
    category: '新能源',
    description: '带倾角支架的光伏板',
  },
  {
    key: 'pvFlat',
    file: 'pv-module-flat.glb',
    name: '屋面光伏板',
    category: '新能源',
    description: '平铺屋面的光伏板',
  },
  {
    key: 'pvRoof',
    file: 'pv-roof-structure.glb',
    name: '光伏屋面',
    category: '新能源',
    description: '带光伏板的坡屋面结构',
  },
  // 电力
  { key: 'polePlain', file: 'pole-plain.glb', name: '配电线杆', category: '电力', description: '架空线路水泥杆' },
  {
    key: 'poleTransformer',
    file: 'pole-transformer.glb',
    name: '柱上变压器杆',
    category: '电力',
    description: '单台变压器的线杆',
  },
  {
    key: 'poleTransformerDouble',
    file: 'pole-transformer-double.glb',
    name: '双变压器杆',
    category: '电力',
    description: '两台变压器的线杆',
  },
  {
    key: 'transformerUnit',
    file: 'pole-transformer-unit.glb',
    name: '柱上变压器',
    category: '电力',
    description: '单独的变压器本体',
  },
  { key: 'utilityBox', file: 'utility-box.glb', name: '配电箱', category: '电力', description: '户外单门配电箱' },
  {
    key: 'utilityCabinet',
    file: 'utility-cabinet.glb',
    name: '配电柜',
    category: '电力',
    description: '户外双门配电柜',
  },
  {
    key: 'breakerPanel',
    file: 'breaker-panel.glb',
    name: '断路器配电盘',
    category: '电力',
    description: '壁挂配电盘，柜门打开',
  },
  {
    key: 'generator',
    file: 'portable-generator.glb',
    name: '便携发电机',
    category: '电力',
    description: '汽油发电机组',
  },
  {
    key: 'towerA',
    file: 'transmission-tower-a.glb',
    name: '输电铁塔 A',
    category: '电力',
    description: '高压输电铁塔',
  },
  {
    key: 'towerB',
    file: 'transmission-tower-b.glb',
    name: '输电铁塔 B',
    category: '电力',
    description: '高压输电铁塔',
  },
  {
    key: 'towerCat',
    file: 'transmission-tower-cat.glb',
    name: '猫头塔',
    category: '电力',
    description: '酒杯形输电铁塔',
  },
  {
    key: 'towerGantry',
    file: 'transmission-gantry.glb',
    name: '门型构架',
    category: '电力',
    description: '变电站进线门型架',
  },
  // 建筑
  {
    key: 'energyCenter',
    file: 'energy-center.glb',
    name: '综合能源站',
    category: '建筑',
    description: '屋顶光伏厂房',
    scale: 15,
  },
  { key: 'office', file: 'office-tower.glb', name: '办公楼', category: '建筑', description: '玻璃幕墙高层', scale: 14 },
  { key: 'factory', file: 'factory.glb', name: '制造车间', category: '建筑', description: '屋顶光伏车间', scale: 16 },
  {
    key: 'warehouse',
    file: 'warehouse.glb',
    name: '仓储中心',
    category: '建筑',
    description: '仓库 / 物流',
    scale: 18,
  },
  {
    key: 'officeHighRise',
    file: 'office-high-rise.glb',
    name: '写字楼',
    category: '建筑',
    description: '带冠顶的高层写字楼',
  },
  {
    key: 'slabTower',
    file: 'office-slab-tower.glb',
    name: '板式高层',
    category: '建筑',
    description: '板式高层办公楼',
  },
  { key: 'campusOffice', file: 'office-campus.glb', name: '综合办公楼', category: '建筑', description: '多层综合楼' },
  { key: 'rndBuilding', file: 'office-rnd.glb', name: '研发楼', category: '建筑', description: '多层研发楼' },
  {
    key: 'serviceBuilding',
    file: 'service-building.glb',
    name: '配套服务楼',
    category: '建筑',
    description: '食堂、配套用房',
  },
  { key: 'dormitory', file: 'dormitory.glb', name: '宿舍楼', category: '建筑', description: '多层宿舍' },
  { key: 'adminBuilding', file: 'admin-building.glb', name: '管理楼', category: '建筑', description: '园区管理用房' },
  { key: 'brickOffice', file: 'brick-office.glb', name: '红砖办公楼', category: '建筑', description: '坡屋顶红砖楼' },
  // 工业
  {
    key: 'overheadCrane',
    file: 'overhead-crane.glb',
    name: '桥式起重机',
    category: '工业',
    description: '12 米跨度行车，含轨道和电动葫芦',
  },
  {
    key: 'compressor',
    file: 'air-compressor.glb',
    name: '空气压缩机',
    category: '工业',
    description: '储气罐式空压机',
  },
  {
    key: 'pipes',
    file: 'industrial-pipes.glb',
    name: '工业管道组',
    category: '工业',
    description: '带弯头和法兰的管道',
  },
  { key: 'drillPress', file: 'drill-press.glb', name: '台式钻床', category: '工业', description: '车间机加工设备' },
  { key: 'weldingCart', file: 'welding-cart.glb', name: '焊接推车', category: '工业', description: '带气瓶的焊接小车' },
  { key: 'toolCart', file: 'tool-cart.glb', name: '工具推车', category: '工业', description: '车间工具小车' },
  { key: 'toolChest', file: 'tool-chest.glb', name: '工具箱', category: '工业', description: '多层金属工具箱' },
  {
    key: 'outdoorAc',
    file: 'outdoor-ac-unit.glb',
    name: '室外空调机',
    category: '工业',
    description: '壁挂式室外机组',
  },
  { key: 'oilDrum', file: 'oil-drum.glb', name: '危化品油桶', category: '工业', description: '带危险标识的钢桶' },
  { key: 'steelDrum', file: 'steel-drum.glb', name: '钢桶', category: '工业', description: '蓝色工业钢桶' },
  { key: 'gasCylinder', file: 'gas-cylinder.glb', name: '液化气瓶', category: '工业', description: '大号气瓶' },
  {
    key: 'gasCylinderSmall',
    file: 'gas-cylinder-small.glb',
    name: '小型气瓶',
    category: '工业',
    description: '小号气瓶',
  },
  // 物流
  { key: 'steelShelves', file: 'steel-shelves.glb', name: '钢架货架', category: '物流', description: '四层仓储货架' },
  { key: 'metalRack', file: 'metal-rack.glb', name: '金属货架', category: '物流', description: '旧款金属货架' },
  { key: 'handTruck', file: 'hand-truck.glb', name: '手推车', category: '物流', description: '两轮搬运车' },
  { key: 'storageCart', file: 'storage-cart.glb', name: '物料推车', category: '物流', description: '双层物料车' },
  { key: 'plasticCrate', file: 'plastic-crate.glb', name: '周转箱', category: '物流', description: '塑料物流箱' },
  { key: 'pallet', file: 'pallet.glb', name: '木托盘', category: '物流', description: '1.2 米标准托盘' },
  {
    key: 'containerRed',
    file: 'shipping-container-red.glb',
    name: '红色集装箱',
    category: '物流',
    description: '20 尺集装箱',
  },
  {
    key: 'containerBlue',
    file: 'shipping-container-blue.glb',
    name: '蓝色集装箱',
    category: '物流',
    description: '20 尺集装箱',
  },
  { key: 'boxTruck', file: 'box-truck.glb', name: '厢式货车', category: '物流', description: '城市配送货车' },
  { key: 'pickup', file: 'pickup-truck.glb', name: '皮卡', category: '物流', description: '园区工程车' },
  {
    key: 'coveredCar',
    file: 'covered-car.glb',
    name: '车衣轿车',
    category: '物流',
    description: '停放的小轿车，盖着车衣',
  },
  // 园区
  { key: 'streetLamp', file: 'street-lamp.glb', name: '路灯', category: '园区', description: '约 4 米高的庭院路灯' },
  { key: 'cameraA', file: 'security-camera-a.glb', name: '监控摄像头 A', category: '园区', description: '枪式摄像机' },
  { key: 'cameraB', file: 'security-camera-b.glb', name: '监控摄像头 B', category: '园区', description: '枪式摄像机' },
  { key: 'securityLight', file: 'security-light.glb', name: '安防投光灯', category: '园区', description: '户外防护灯' },
  { key: 'hydrant', file: 'fire-hydrant.glb', name: '消防栓', category: '园区', description: '室外地上消防栓' },
  {
    key: 'extinguisher',
    file: 'fire-extinguisher.glb',
    name: '灭火器',
    category: '园区',
    description: '带底座的灭火器',
  },
  { key: 'roadBarrier', file: 'road-barrier.glb', name: '水泥隔离墩', category: '园区', description: '道路隔离墩' },
  {
    key: 'fenceSection',
    file: 'fence-section.glb',
    name: '铁丝网围栏',
    category: '园区',
    description: '一段 2 米围栏，可排列',
  },
  { key: 'fenceGate', file: 'fence-gate.glb', name: '围栏小门', category: '园区', description: '带门框的铁丝网门' },
  { key: 'ironGate', file: 'iron-gate.glb', name: '铁艺大门', category: '园区', description: '双开园区大门' },
  { key: 'trashCan', file: 'trash-can.glb', name: '垃圾桶', category: '园区', description: '金属垃圾桶' },
  { key: 'manhole', file: 'manhole-cover.glb', name: '井盖', category: '园区', description: '铸铁检查井盖' },
  { key: 'bench', file: 'park-bench.glb', name: '长椅', category: '园区', description: '木条金属长椅' },
  { key: 'outdoorTable', file: 'outdoor-table-set.glb', name: '户外桌椅', category: '园区', description: '一桌两椅' },
  { key: 'trafficBarrel', file: 'traffic-barrel.glb', name: '交通桶', category: '园区', description: '道路警示桶' },
  { key: 'trafficBarrier', file: 'traffic-barrier.glb', name: '施工围挡', category: '园区', description: '条纹路障' },
  { key: 'fireEscape', file: 'fire-escape.glb', name: '室外消防梯', category: '园区', description: '多层钢制逃生梯' },
  { key: 'waterTower', file: 'water-tower.glb', name: '高位水塔', category: '园区', description: '钢架水塔' },
  { key: 'officeDesk', file: 'office-desk.glb', name: '办公桌', category: '园区', description: '中控室、值班室用' },
  { key: 'armchair', file: 'armchair.glb', name: '扶手椅', category: '园区', description: '接待区座椅' },
  // 绿化
  { key: 'treeA', file: 'tree-broadleaf-a.glb', name: '阔叶树 A', category: '绿化', description: '园区行道树' },
  { key: 'treeB', file: 'tree-broadleaf-b.glb', name: '阔叶树 B', category: '绿化', description: '园区行道树' },
  { key: 'treeAutumn', file: 'tree-autumn.glb', name: '秋色树', category: '绿化', description: '黄叶景观树' },
  { key: 'pine', file: 'tree-pine.glb', name: '松树', category: '绿化', description: '常绿针叶树' },
  { key: 'spruce', file: 'tree-spruce.glb', name: '云杉', category: '绿化', description: '常绿针叶树' },
  { key: 'bush', file: 'bush.glb', name: '灌木', category: '绿化', description: '低矮灌木丛' },
  { key: 'hedge', file: 'hedge.glb', name: '绿篱', category: '绿化', description: '修剪绿篱' },
  { key: 'pottedPlant', file: 'potted-plant.glb', name: '盆栽', category: '绿化', description: '室内外盆栽' },
  { key: 'planterBox', file: 'planter-box.glb', name: '花箱', category: '绿化', description: '木质种植箱' },
]

export function getBuiltinModel(key: string): BuiltinModel | undefined {
  return builtinModels.find(model => model.key === key)
}

/** 预先渲染好的缩略图（scripts/render-builtin-thumbnails.mjs）：资源库不用为了缩略图把所有模型都下载一遍。 */
export function builtinThumbnailUrl(file: string): string {
  return `${import.meta.env.BASE_URL}demo-assets/thumbs/${file.replace(/\.glb$/, '.webp')}`
}

/** Adds a built-in model to the asset library on first use; later calls return the existing record. */
export async function importBuiltinModel(model: BuiltinModel, repository: AssetRepository): Promise<AssetRecord> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo-assets/${model.file}`)
  if (!response.ok) throw new Error(`内置模型加载失败：${model.name}（HTTP ${response.status}）`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  validatePortableAsset(bytes, 'model')
  return repository.saveFile(new File([bytes], model.file, { type: 'model/gltf-binary', lastModified: 0 }), 'model')
}
