// Run with NODE_PATH pointing to a Playwright installation and Vite on :5173.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
await context.addInitScript(() => {
  const urls = new Set(), frames = new Set()
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = (...args) => { const url=create(...args); urls.add(url); return url }
  URL.revokeObjectURL = (url) => { urls.delete(url); revoke(url) }
  const request = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = (fn) => { const id=request(t=>{frames.delete(id);fn(t)}); frames.add(id); return id }
  window.cancelAnimationFrame = (id) => { frames.delete(id);cancel(id) }
  window.qaResources = () => ({urls:urls.size,raf:frames.size})
  const tracked = new Map(['pointermove','pointerup','pointercancel'].map(type=>[type,new Set()]))
  const add=window.addEventListener.bind(window), remove=window.removeEventListener.bind(window)
  window.addEventListener=(type,fn,...rest)=>{tracked.get(type)?.add(fn);add(type,fn,...rest)}
  window.removeEventListener=(type,fn,...rest)=>{tracked.get(type)?.delete(fn);remove(type,fn,...rest)}
  // Playwright installs its own persistent hit-target interceptor on first UI action.
  window.qaPointerListeners=()=>[...tracked.values()].flatMap(list=>[...list]).filter(fn=>!String(fn).includes('_hitTargetInterceptor')).length
})
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const projectId = `stage-i-${Date.now()}`
const report = {}

function cabinetGlb() {
  const positions = new Float32Array([-0.5,0,-0.5, 0.5,0,-0.5, 0.5,1,-0.5, -0.5,1,-0.5, -0.5,0,0.5, 0.5,0,0.5, 0.5,1,0.5, -0.5,1,0.5])
  const indices = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3])
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)])
  const data = { asset:{version:'2.0'}, scene:0, scenes:[{name:'Cabinet',nodes:[0]}],
    nodes:[{name:'CabinetRoot',children:[1,2,3]}, {name:'Body',mesh:0,scale:[2,3,1]}, {name:'BatteryDoor',mesh:0,translation:[0,0,0.6],scale:[1.8,2.8,0.1]}, {name:'RemovablePanel',mesh:0,translation:[0,3.1,0]}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}], materials:[{pbrMetallicRoughness:{baseColorFactor:[0.2,0.5,0.8,1],metallicFactor:0,roughnessFactor:0.6}}],
    buffers:[{byteLength:bin.length}], bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength}],
    accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-0.5,0,-0.5],max:[0.5,1,0.5]},{bufferView:1,componentType:5123,count:36,type:'SCALAR'}] }
  const raw = Buffer.from(JSON.stringify(data)); const json = Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)])
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4); header.writeUInt32LE(28+json.length+bin.length,8); header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16)
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length,0); bh.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,json,bh,bin])
}
async function editorReady() { await page.getByTestId('editor-viewport').waitFor(); await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true') }
async function viewerReady() { await page.waitForFunction(() => document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded === 'true') }
try {
  await page.goto(`${base}/editor/${projectId}`); await editorReady()
  await page.getByTestId('asset-file-input').setInputFiles({ name:'cabinet.glb', mimeType:'model/gltf-binary', buffer:cabinetGlb() })
  const card = page.locator('[data-testid^="asset-card-"]').first(); await card.waitFor()
  await card.dblclick(); await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.sceneRootCount === '2')
  await card.dblclick(); await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.sceneRootCount === '3')
  await page.getByTestId('asset-primitive-plane').click(); await page.getByTestId('asset-primitive-cylinder').click()
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/stores/editor.ts'); const editor = useEditorStore()
    const { useTwinStore } = await import('/src/stores/twin.ts'); const twin = useTwinStore()
    const { useSceneSettingsStore } = await import('/src/stores/sceneSettings.ts'); const settings = useSceneSettingsStore()
    const { bindingTargetFromObject } = await import('/src/editor/services/BindingTargetResolver.ts')
    const { captureTransform } = await import('/src/editor/history/index.ts')
    const models = editor.sceneRoots.filter(o => o.userData.editor.kind === 'assetInstance')
    const [a,b] = models; a.name='Cabinet A'; b.name='Cabinet B'
    const before = captureTransform(a); a.position.set(-3,0,0); editor.commitTransform(a,before,captureTransform(a))
    b.position.set(3,0,0); b.rotation.y=0.6; b.scale.set(1.2,1.2,1.2); editor.notifyTransformChanged('inspector',b)
    const door=a.getObjectByName('BatteryDoor'); door.position.x=0.25; door.name='Door override'; editor.markObjectModified(door)
    const hidden=b.getObjectByName('BatteryDoor'); hidden.visible=false; editor.markObjectModified(hidden)
    editor.selectObject(a.getObjectByName('RemovablePanel')); editor.deleteSelected()
    const variables=[['soc','number','%'],['temperature','number','℃'],['power','number','kW'],['alarm','boolean',''],['status','string','']].map(([key,dataType,unit])=>({id:key,key,name:key,dataType,unit}))
    for (const [object,id] of [[a,'ESS-001'],[door,'DOOR-001'],[editor.sceneRoots[0],'SENSOR-001']]) twin.upsertBinding({id:`binding-${id}`,target:bindingTargetFromObject(object),device:{id,name:id},variables})
    settings.settings.ground.color='#354657'; settings.settings.ground.size=80
    settings.settings.lighting.ambientIntensity=0.8; settings.settings.lighting.directionalIntensity=1.7; settings.settings.axesEnabled=true
    settings.revision++
    const {IndexedDbAssetRepository}=await import('/src/infrastructure/assets/index.ts')
    const hdr = new Uint8Array([...new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n'), ...Array(4).fill([128,128,128,129]).flat()])
    const environment = await new IndexedDbAssetRepository().saveFile(new File([hdr],'test.hdr',{type:'image/vnd.radiance'}),'environment')
    settings.setEnvironmentAssetId(environment.id)
    editor.selectObject(a)
  })
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.environmentStatus === 'test.hdr')
  // Stage J: actual effect resource / Inspector controls, shared-material isolation and history.
  await page.getByTestId('effects-tab').click()
  for (const kind of ['box-glow','ground-pulse','outline','floating-label']) await page.getByTestId(`add-effect-${kind}`).click()
  const padding = page.getByTestId('effect-box-glow-padding')
  await padding.fill('0.6'); await padding.press('Tab')
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.equal(await padding.inputValue(),'0.2')
  await page.getByRole('button',{name:'重做',exact:true}).click()
  assert.equal(await padding.inputValue(),'0.6')
  await page.getByTestId('effect-floating-label-text').fill('ESS-001 Live')
  await page.getByTestId('effect-floating-label-text').press('Tab')
  await page.evaluate(async()=>{
    const {useEditorStore}=await import('/src/stores/editor.ts');const e=useEditorStore()
    const a=e.sceneRoots.find(o=>o.name==='Cabinet A'),b=e.sceneRoots.find(o=>o.name==='Cabinet B')
    window.qaOriginalMaterial=a.getObjectByName('Door override').material
    window.qaOtherMaterial=b.getObjectByName('BatteryDoor').material
    e.selectObject(a.getObjectByName('Door override'))
  })
  await page.getByTestId('add-effect-child-highlight').click()
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.equal(await page.getByTestId('remove-effect-child-highlight').count(),0)
  await page.getByRole('button',{name:'重做',exact:true}).click()
  const isolated=await page.evaluate(async()=>{
    const {useEditorStore}=await import('/src/stores/editor.ts');const e=useEditorStore()
    const a=e.sceneRoots.find(o=>o.name==='Cabinet A'),b=e.sceneRoots.find(o=>o.name==='Cabinet B')
    return a.getObjectByName('Door override').material!==window.qaOriginalMaterial && b.getObjectByName('BatteryDoor').material===window.qaOtherMaterial && window.qaOtherMaterial.emissive.getHex()===0
  });assert(isolated)
  await page.getByTestId('remove-effect-child-highlight').click()
  assert(await page.evaluate(async()=>{const {useEditorStore}=await import('/src/stores/editor.ts');return useEditorStore().selectedObject.material===window.qaOriginalMaterial}))
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await page.getByRole('button',{name:'重做',exact:true}).click()
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await page.evaluate(async()=>{const {useEditorStore}=await import('/src/stores/editor.ts');const e=useEditorStore();e.selectObject(e.sceneRoots.find(o=>o.name==='Cabinet A'));e.deleteSelected()})
  assert.equal(await page.evaluate(async()=>{const {useEffectsStore}=await import('/src/stores/effects.ts');return useEffectsStore().instances.length}),0)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.equal(await page.evaluate(async()=>{const {useEffectsStore}=await import('/src/stores/effects.ts');return useEffectsStore().instances.length}),5)
  await page.screenshot({path:'/tmp/twin-effects-editor.png'})
  report.effects='PASS: five atoms, Inspector edit, material isolation/restoration, remove undo/redo, target delete/undo'
  await page.getByRole('button',{name:'保存 *',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.sceneDirty === 'false')
  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)),projectId)
  assert.equal(saved.instances.length,2); assert.equal(saved.primitives.length,3); assert.equal(saved.bindings.length,3)
  assert.equal(saved.effects.length,5);assert.equal(saved.effects.find(e=>e.kind==='box-glow').parameters.padding,0.6)
  assert.equal(saved.instances[0].deletedAssetNodeIds.length,1)
  assert.equal(saved.instances[0].nodeOverrides[0].name,'Door override')
  report.editorFixture='PASS: UI GLB upload, two instances, three primitives, overrides, deleted child, bindings and Save'

  await page.reload(); await editorReady()
  const regression = await page.evaluate(async () => {
    const {useEditorStore}=await import('/src/stores/editor.ts');const e=useEditorStore()
    const a=e.sceneRoots.find(o=>o.name==='Cabinet A');const door=a.getObjectByName('Door override')
    e.selectObject(door)
    return {roots:e.sceneRoots.length,childX:door.position.x,deleted:!a.getObjectByName('RemovablePanel'),modified:e.modifiedObjects.length}
  })
  assert.equal(regression.roots,5); assert.equal(regression.childX,0.25); assert(regression.deleted)
  assert.equal(await page.evaluate(async()=>{const {useEffectsStore}=await import('/src/stores/effects.ts');return useEffectsStore().instances.length}),5)
  assert.equal(await page.getByTestId('editor-viewport').getAttribute('data-transform-attached'),'true')
  await page.evaluate(async()=>{const {useEditorStore}=await import('/src/stores/editor.ts');const e=useEditorStore();e.selectObject(e.sceneRoots.find(o=>o.name==='Cabinet A'))})
  await page.getByRole('button',{name:'复制',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.sceneRootCount === '6')
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.sceneRootCount === '5')
  await page.getByRole('button',{name:'重做',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]').dataset.sceneRootCount === '6')
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  report.editorRegression={...regression,history:'PASS'}
  // SPA navigation exercises unmount, unlike a full document reload.
  await page.evaluate(async () => { const router=document.querySelector('#app').__vue_app__.config.globalProperties.$router; await router.push('/projects') })
  await page.evaluate(async id => { const router=document.querySelector('#app').__vue_app__.config.globalProperties.$router; await router.push(`/dev/viewer?projectId=${id}`) },projectId)
  await viewerReady()
  assert.equal(await page.locator('[data-testid="editor-viewport"], [data-testid="inspector-panel"], [data-testid="asset-panel"], [data-testid="scene-hierarchy"]').count(),0)

  const viewer = await page.evaluate(async saved => {
    const exposed=document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
    const state=exposed.getRuntimeState()
    const roots=[...saved.instances.map(i=>exposed.getRuntimeObject({type:'asset-instance',instanceId:i.instanceId})),...saved.primitives.map(p=>exposed.getRuntimeObject({type:'primitive',nodeId:p.nodeId}))]
    const [a,b]=roots
    if (a.parent.getObjectByName('Runtime Effects').children.length !== 3) throw new Error('Effects not restored in Viewer')
    if (a.getObjectByName('Door override').material === b.getObjectByName('BatteryDoor').material) throw new Error('Highlight not isolated in Viewer')
    const snapshot = (o)=>({name:o.name,position:o.position.toArray(),rotation:[o.rotation.x,o.rotation.y,o.rotation.z],scale:o.scale.toArray(),visible:o.visible})
    let transforms=0; a.parent.traverse(o=>{if(o.type.includes('TransformControls'))transforms++})
    const {getMockDataSourceDiagnostics}=await import('/src/infrastructure/data/MockDataSource.ts')
    return {roots:roots.map(snapshot),independent:a!==b&&a.getObjectByName('Body')!==b.getObjectByName('Body'),override:a.getObjectByName('Door override').position.x,deleted:!a.getObjectByName('RemovablePanel'),hidden:!b.getObjectByName('BatteryDoor').visible,bindings:state.bindings.length,values:Object.keys(state.runtimeValues).length,ticks:state.mockTickCount,transforms,timers:getMockDataSourceDiagnostics().activeTimerCount}
  },saved)
  assert(viewer.independent&&viewer.deleted&&viewer.hidden);assert.equal(viewer.override,0.25);assert.equal(viewer.transforms,0);assert.equal(viewer.timers,1);assert.equal(viewer.values,15)
  for(const [i,expected] of [...saved.instances,...saved.primitives].entries()) {assert.deepEqual(viewer.roots[i].position,expected.transform.position);assert.deepEqual(viewer.roots[i].scale,expected.transform.scale);assert.deepEqual(viewer.roots[i].rotation,expected.transform.rotation)}
  await page.waitForTimeout(1200)
  assert(Number(await page.getByTestId('twin-scene-viewer').getAttribute('data-mock-ticks'))>viewer.ticks)
  assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)),projectId),saved)
  report.viewer=viewer
  report.lifecycle=[]
  for(let i=0;i<3;i++) {
    await page.evaluate(async()=>{const r=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await r.push('/projects')})
    await page.waitForTimeout(600)
    const disposed=await page.evaluate(async()=>{
      const {getMockDataSourceDiagnostics}=await import('/src/infrastructure/data/MockDataSource.ts')
      const {getLastMeteorDisposeDiagnostics}=await import('/src/infrastructure/meteor3d/MeteorScene.ts')
      return {timers:getMockDataSourceDiagnostics().activeTimerCount,dispose:getLastMeteorDisposeDiagnostics(),resources:window.qaResources(),pointerListeners:window.qaPointerListeners()}
    })
    assert.equal(disposed.timers,0);assert(disposed.dispose.sceneManagerDisposed&&disposed.dispose.resizeObserverDisconnected&&disposed.dispose.webglContextLost)
    assert.equal(disposed.resources.urls,0);assert.equal(disposed.resources.raf,0)
    assert.equal(disposed.pointerListeners,0)
    await page.evaluate(async id=>{const r=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await r.push(`/dev/viewer?projectId=${id}`)},projectId)
    await viewerReady(); assert.equal(await page.locator('canvas').count(),1)
    report.lifecycle.push(disposed)
  }
  // Direct URL load must not import or instantiate EditorStore.
  const direct=await context.newPage(); const requests=[]
  direct.on('request',r=>requests.push(r.url()))
  await direct.goto(`${base}/dev/viewer?projectId=${projectId}`)
  await direct.waitForFunction(()=>document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded==='true')
  assert(!requests.some(url=>url.includes('/src/stores/editor.ts')))
  report.directViewerWithoutEditorStore='PASS'
  await direct.close()

  // Exercise the exact runtime service behind the component, with injected repositories.
  await page.evaluate(async()=>{const r=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await r.push('/projects')})
  const runtimeDetails=await page.evaluate(async id=>{
    const {TwinSceneRuntime}=await import('/src/runtime/twin/TwinSceneRuntime.ts')
    const {LocalSceneRepository}=await import('/src/infrastructure/scenes/index.ts')
    const {IndexedDbAssetRepository}=await import('/src/infrastructure/assets/index.ts')
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:9999';document.body.append(canvas)
    window.qaClicks=[]
    const runtime=new TwinSceneRuntime(canvas,new LocalSceneRepository(),new IndexedDbAssetRepository(),event=>window.qaClicks.push(event));window.qaRuntime=runtime
    await runtime.load(id)
    const scene=runtime.meteor.getScene(),camera=runtime.meteor.getCamera(),view=runtime.meteor.getView()
    const a=runtime.roots.find(o=>o.name==='Cabinet A'),door=a.getObjectByName('Door override')
    camera.updateMatrixWorld(true);a.updateMatrixWorld(true)
    const center=door.position.clone().set(0,0.5,0);door.localToWorld(center);center.project(camera)
    const rect=canvas.getBoundingClientRect()
    window.qaCameraBefore=camera.position.toArray()
    return {camera:{position:[view.position.x,view.position.y,view.position.z],target:[view.target.x,view.target.y,view.target.z],fov:camera.fov},
      ground:{size:scene.getObjectByName('Editor Ground').scale.x,color:scene.getObjectByName('Editor Ground').material.color.getHexString()},
      ambient:scene.getObjectByName('Editor Ambient Light').intensity,directional:scene.getObjectByName('Editor Directional Light').intensity,
      environment:!!scene.environment,environmentStatus:runtime.loader.environmentStatus,
      click:{x:rect.left+(center.x+1)*rect.width/2,y:rect.top+(1-center.y)*rect.height/2}}
  },projectId)
  assert.deepEqual(runtimeDetails.camera,saved.cameraView)
  assert.equal(runtimeDetails.ground.size,80);assert.equal(runtimeDetails.ground.color,'354657')
  assert.equal(runtimeDetails.ambient,0.8);assert.equal(runtimeDetails.directional,1.7);assert(runtimeDetails.environment)
  report.effectRuntime=await page.evaluate(async()=>{
    const runtime=window.qaRuntime,effects=runtime.effects,snapshot=effects.getSnapshot()
    const {createEffect}=await import('/src/domain/effects/index.ts')
    const {bindingTargetFromObject}=await import('/src/editor/services/BindingTargetResolver.ts')
    const {Box3,Vector3}=await import('/node_modules/three/build/three.module.js')
    const a=runtime.roots.find(o=>o.name==='Cabinet A'),b=runtime.roots.find(o=>o.name==='Cabinet B')
    effects.setEffects([])
    const door=a.getObjectByName('Door override'),other=b.getObjectByName('BatteryDoor'),original=door.material
    const shared=[original,original];door.material=shared;other.material=shared
    const rootEffect=createEffect('child-highlight',bindingTargetFromObject(a))
    const childEffect=createEffect('child-highlight',bindingTargetFromObject(door));childEffect.parameters.color='#ff0000'
    effects.setEffects([rootEffect,childEffect])
    const arrayIsolated=door.material!==shared && other.material===shared && shared[0]===original && door.material[0].emissive.getHexString()==='ff0000'
    let disposedMaterials=0;door.material.forEach(m=>m.addEventListener('dispose',()=>disposedMaterials++))
    effects.setEffects([])
    const restored=door.material===shared && disposedMaterials===2
    door.material=original;other.material=original
    effects.setEffects(snapshot)
    const helper=effects.root.children.find(o=>o.name===`Effect:${snapshot.find(e=>e.kind==='box-glow').id}`)
    const before=helper.position.clone();a.position.x+=2;a.scale.multiplyScalar(1.5)
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    const expected=new Box3().setFromObject(a,true).getCenter(new Vector3())
    const follows=helper.position.distanceTo(expected)<0.001 && helper.position.distanceTo(before)>1
    a.position.x-=2;a.scale.multiplyScalar(1/1.5)
    let geometries=0,materials=0,textures=0
    effects.root.traverse(o=>{
      o.geometry?.addEventListener('dispose',()=>geometries++)
      if(o.material){o.material.addEventListener('dispose',()=>materials++);o.material.map?.addEventListener('dispose',()=>textures++)}
    })
    effects.setEffects([])
    const released=geometries===3 && materials===4 && textures===1 && effects.root.children.length===0
    effects.setEffects(snapshot)
    return {arrayIsolated,restored,follows,released,diagnostics:effects.getDiagnostics()}
  })
  assert(report.effectRuntime.arrayIsolated&&report.effectRuntime.restored&&report.effectRuntime.follows&&report.effectRuntime.released)
  await page.mouse.click(runtimeDetails.click.x,runtimeDetails.click.y)
  const hit=await page.evaluate(()=>window.qaClicks[0]);assert(hit?.target);assert(hit?.device)
  const clickCount=await page.evaluate(()=>window.qaClicks.length)
  await page.mouse.move(900,400);await page.mouse.down();await page.mouse.move(1050,450,{steps:10});await page.mouse.up();await page.waitForTimeout(200)
  const orbit=await page.evaluate(()=>({changed:JSON.stringify(window.qaRuntime.meteor.getCamera().position.toArray())!==JSON.stringify(window.qaCameraBefore),clicks:window.qaClicks.length}))
  assert(orbit.changed);assert.equal(orbit.clicks,clickCount)
  await page.mouse.wheel(0,150);await page.waitForTimeout(200)
  const focus=await page.evaluate(async()=>({device:await window.qaRuntime.focusDevice('ESS-001'),missing:await window.qaRuntime.focusDevice('DOES-NOT-EXIST')}))
  assert(focus.device);assert.equal(focus.missing,false)
  await page.setViewportSize({width:1280,height:850});await page.waitForTimeout(200)
  assert(await page.evaluate(()=>window.qaRuntime.meteor.getDiagnostics().resize))
  report.runtimeDetails={...runtimeDetails,hit,orbit,focus,resize:'PASS'}
  await page.evaluate(()=>{window.qaRuntime.dispose();window.qaRuntime.meteor;document.querySelector('canvas').remove()})
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(()=>window.qaResources()),{urls:0,raf:0})
  // Component prop change recreates its canvas after forceContextLoss.
  await page.evaluate(async id=>{const r=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await r.push(`/dev/viewer?projectId=${id}`)},projectId)
  await viewerReady()
  await page.evaluate(async id=>{const key='digital-twin-studio:scene:v1:';const doc=JSON.parse(localStorage.getItem(key+id));doc.projectId=id+'-copy';localStorage.setItem(key+doc.projectId,JSON.stringify(doc));const r=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await r.replace(`/dev/viewer?projectId=${doc.projectId}`)},projectId)
  await viewerReady();assert.equal(await page.locator('canvas').count(),1)
  report.projectSwitch='PASS'
  const componentPoint=await page.evaluate(async saved=>{
    const {PerspectiveCamera,Vector3}=await import('/node_modules/three/build/three.module.js')
    const element=document.querySelector('[data-testid="twin-scene-viewer"]'),api=element.__vueParentComponent.exposed
    const object=api.getRuntimeObject(saved.bindings.find(b=>b.device.id==='DOOR-001').target)
    const rect=element.querySelector('canvas').getBoundingClientRect(),view=saved.cameraView
    const camera=new PerspectiveCamera(view.fov,rect.width/rect.height,0.1,10000);camera.position.fromArray(view.position);camera.lookAt(new Vector3(...view.target));camera.updateMatrixWorld(true)
    const point=new Vector3(0,0.5,0);object.localToWorld(point);point.project(camera)
    return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2}
  },saved)
  await page.mouse.click(componentPoint.x,componentPoint.y)
  const emitted=JSON.parse(await page.getByTestId('viewer-click-event').textContent())
  assert.equal(emitted.device.id,'DOOR-001');report.vueEmit='PASS'
  await page.screenshot({path:'/tmp/twin-viewer-stage-i.png'})
  await page.evaluate(async()=>{const r=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await r.push('/projects')})
  report.pendingLoad=await page.evaluate(async id=>{
    const {TwinSceneRuntime}=await import('/src/runtime/twin/TwinSceneRuntime.ts')
    const {LocalSceneRepository}=await import('/src/infrastructure/scenes/index.ts')
    const {IndexedDbAssetRepository}=await import('/src/infrastructure/assets/index.ts')
    const {getMockDataSourceDiagnostics}=await import('/src/infrastructure/data/MockDataSource.ts')
    const canvas=document.createElement('canvas');canvas.style.cssText='width:400px;height:300px';document.body.append(canvas)
    const runtime=new TwinSceneRuntime(canvas,new LocalSceneRepository(),new IndexedDbAssetRepository(),()=>{})
    const original=runtime.meteor.loadGLTFModel.bind(runtime.meteor)
    runtime.meteor.loadGLTFModel=url=>{const result=original(url);queueMicrotask(()=>runtime.dispose());return result}
    let cancelled=false
    try{await runtime.load(id)}catch(error){cancelled=error.name==='AbortError'}
    runtime.dispose();canvas.remove()
    return {cancelled,resources:window.qaResources(),timers:getMockDataSourceDiagnostics().activeTimerCount,pointerListeners:window.qaPointerListeners()}
  },projectId)
  assert(report.pendingLoad.cancelled);assert.equal(report.pendingLoad.resources.urls,0);assert.equal(report.pendingLoad.timers,0);assert.equal(report.pendingLoad.pointerListeners,0)
  for(let i=0;i<3;i++) {
    await page.evaluate(async id=>{await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(`/editor/${id}`)},projectId)
    await editorReady()
    await page.evaluate(async()=>{await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/projects')})
    await page.waitForTimeout(400)
    assert.deepEqual(await page.evaluate(()=>window.qaResources()),{urls:0,raf:0})
    assert.equal(await page.evaluate(async()=>{const {getEffectDiagnostics}=await import('/src/runtime/effects/EffectRuntime.ts');return getEffectDiagnostics().activeLoops}),0)
  }
  report.editorEffectLifecycle='PASS: three mount/unmount cycles, zero remaining RAF/URLs/effect loops'
  assert.deepEqual(errors,[])
  console.log(JSON.stringify(report,null,2))
} catch(error) {
  console.error('QA failure', {url:page.url(),errors,report})
  await page.screenshot({path:'/tmp/twin-viewer-failure.png'})
  throw error
} finally { await context.close(); await browser.close() }
