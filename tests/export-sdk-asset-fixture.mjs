import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { chromium }=createRequire(import.meta.url)('playwright')
function cabinetGlb(){
  const positions=new Float32Array([-0.5,0,-0.5,0.5,0,-0.5,0.5,1,-0.5,-0.5,1,-0.5,-0.5,0,0.5,0.5,0,0.5,0.5,1,0.5,-0.5,1,0.5]),indices=new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3]),bin=Buffer.concat([Buffer.from(positions.buffer),Buffer.from(indices.buffer)])
  const data={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'SDK Cabinet',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-.5,0,-.5],max:[.5,1,.5]},{bufferView:1,componentType:5123,count:36,type:'SCALAR'}]}
  const raw=Buffer.from(JSON.stringify(data)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),header=Buffer.alloc(20),bh=Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,json,bh,bin])
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext(),page=await context.newPage()
try{
  const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5190',id=`sdk-assets-${Date.now()}`,now=new Date().toISOString()
  await page.goto(`${base}/projects`)
  await page.evaluate(async({id,now})=>{const {useProjectStore}=await import('/src/stores/project.ts');useProjectStore().addImportedProject({id,name:'SDK Asset Fixture',createdAt:now,updatedAt:now})},{id,now})
  await page.evaluate(async id=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(`/editor/${id}`),id)
  await page.waitForFunction(()=>document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady==='true')
  await page.getByTestId('asset-file-input').setInputFiles({name:'sdk-cabinet.glb',mimeType:'model/gltf-binary',buffer:cabinetGlb()})
  const card=page.locator('[data-testid^="asset-card-"]').first();await card.waitFor();await card.dblclick()
  await page.waitForFunction(()=>Number(document.querySelector('[data-testid="editor-viewport"]')?.dataset.sceneRootCount)>=2)
  await page.evaluate(async()=>{const {IndexedDbAssetRepository}=await import('/src/infrastructure/assets/index.ts');const {useSceneSettingsStore}=await import('/src/stores/sceneSettings.ts');const hdr=new Uint8Array([...new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n'),...Array(4).fill([128,128,128,129]).flat()]);const asset=await new IndexedDbAssetRepository().saveFile(new File([hdr],'sdk-environment.hdr',{type:'image/vnd.radiance'}),'environment');useSceneSettingsStore().setEnvironmentAssetId(asset.id)})
  await page.waitForFunction(()=>document.querySelector('[data-testid="editor-viewport"]')?.dataset.environmentStatus==='sdk-environment.hdr')
  await page.getByTestId('save-scene').click();await page.waitForFunction(id=>!!localStorage.getItem(`digital-twin-studio:scene:v1:${id}`),id)
  const bytes=await page.evaluate(async id=>{const {ProjectPackageService}=await import('/src/infrastructure/packages/ProjectPackageService.ts');const {LocalSceneRepository}=await import('/src/infrastructure/scenes/index.ts');const {IndexedDbAssetRepository}=await import('/src/infrastructure/assets/index.ts');const {useProjectStore}=await import('/src/stores/project.ts');const projects=useProjectStore();const blob=await new ProjectPackageService(new LocalSceneRepository(),new IndexedDbAssetRepository(),projects).exportProject(projects.getProjectById(id));return [...new Uint8Array(await blob.arrayBuffer())]},id)
  const output=resolve(process.argv[2]||'../dashboard-viewer-demo/public/sdk-assets-fixture.twin.zip');await writeFile(output,Buffer.from(bytes));console.log(JSON.stringify({output,bytes:bytes.length}))
}finally{await context.close();await browser.close()}
