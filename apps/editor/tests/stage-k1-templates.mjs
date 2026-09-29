import assert from 'node:assert/strict'

// Invoked by the Stage I/J browser harness, using its uploaded two-instance GLB fixture.
export async function testTemplates(page, projectId) {
  const navigate = async path => page.evaluate(async path => {
    await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path)
  }, path)
  const ready = () => page.waitForFunction(() => document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady === 'true')
  const select = async name => page.evaluate(async name => {
    const { useEditorStore } = await import('/src/stores/editor.ts'); const e = useEditorStore()
    e.selectObject(e.sceneRoots.find(o => o.name === name))
  }, name)
  const snapshot = () => page.evaluate(async () => {
    const { useEffectsStore } = await import('/src/stores/effects.ts'); return useEffectsStore().instances
  })
  await navigate(`/editor/${projectId}`); await ready(); await select('Cabinet A')
  const before = await snapshot()
  await page.getByTestId('templates-tab').click()
  const critical = page.locator('[data-template-id="builtin:critical"]')
  await critical.waitFor()
  assert.equal(await critical.getByTestId('delete-template').count(), 0)
  await critical.getByTestId('edit-template').click()
  assert(await page.getByTestId('template-name').isDisabled())
  assert.equal(await page.getByTestId('save-template').count(), 0)
  await page.getByRole('button', { name: '取消', exact: true }).click()

  // Resource CRUD does not mark the scene dirty or add Scene History entries.
  await critical.getByTestId('copy-template').click()
  const copy = page.locator('[data-template-id]').filter({ hasText: '严重告警 副本' })
  await copy.waitFor(); await copy.getByTestId('edit-template').click()
  await page.getByTestId('template-name').fill('Custom warning')
  await page.getByTestId('template-description').fill('Local shared resource')
  await page.getByTestId('template-atom-0-padding').fill('0.8')
  await page.getByTestId('template-atom-0-padding').press('Tab')
  await page.getByTestId('save-template').click()
  const edited = page.locator('[data-template-id]').filter({ hasText: 'Custom warning' })
  await edited.waitFor(); await edited.getByTestId('edit-template').click()
  assert.equal(await page.getByTestId('template-atom-0-padding').inputValue(), '0.8')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await edited.getByTestId('copy-template').click()
  const duplicate = page.locator('[data-template-id]').filter({ hasText: 'Custom warning 副本' })
  await duplicate.waitFor(); await duplicate.getByTestId('delete-template').click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await duplicate.waitFor({ state: 'detached' })
  assert.equal(await page.getByTestId('editor-viewport').getAttribute('data-scene-dirty'), 'false')
  assert(await page.getByRole('button', { name: '撤销', exact: true }).isDisabled())

  await critical.getByTestId('apply-template').click()
  const applied = await snapshot()
  assert.equal(applied.filter(e => e.sourceTemplateId === 'builtin:critical').length, 4)
  assert.equal(applied.length, before.length) // replacement, not stacked duplicates
  assert.equal(applied.find(e => e.kind === 'box-glow').parameters.color, '#ff3030')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  assert.deepEqual(await snapshot(), before)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  assert.deepEqual(await snapshot(), applied)
  await select('Box'); await critical.getByTestId('apply-template').click()
  assert.equal((await snapshot()).filter(e=>e.target.type==='primitive').length,4)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.deepEqual(await snapshot(),applied)
  await select('Cabinet A')

  const nodeId = await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/stores/editor.ts')
    return useEditorStore().sceneRoots.find(o => o.name === 'Cabinet A').getObjectByName('Door override').userData.assetNodeId
  })
  await page.getByTestId('new-template').click()
  await page.getByTestId('template-name').fill('Relative device')
  await page.getByTestId('add-template-atom').click()
  await page.locator('[data-template-atom="0"]').getByTestId('template-target-mode').selectOption('root-instance')
  await page.getByTestId('template-new-kind').selectOption('child-highlight')
  await page.getByTestId('add-template-atom').click()
  await page.locator('[data-template-atom="1"]').getByTestId('template-target-mode').selectOption('asset-node')
  await page.getByTestId('template-asset-node-id').fill(nodeId)
  await page.getByTestId('template-atom-1-color').fill('#00ff00')
  await page.getByTestId('template-atom-1-color').dispatchEvent('change')
  await page.getByTestId('save-template').click()
  const relative = page.locator('[data-template-id]').filter({ hasText: 'Relative device' })
  await relative.waitFor()
  const templateId = await relative.getAttribute('data-template-id')
  // Applying from a child still resolves the owning instance root correctly.
  await page.evaluate(async () => { const { useEditorStore } = await import('/src/stores/editor.ts'); const e=useEditorStore();e.selectObject(e.sceneRoots.find(o=>o.name==='Cabinet A').getObjectByName('Door override')) })
  await relative.getByTestId('apply-template').click()
  await select('Cabinet B'); await relative.getByTestId('apply-template').click()
  const two = (await snapshot()).filter(e => e.sourceTemplateId === templateId)
  assert.equal(two.length, 4)
  assert.equal(new Set(two.map(e => e.target.instanceId)).size, 2)
  assert(two.filter(e => e.kind === 'child-highlight').every(e => e.target.assetNodeId === nodeId))
  const isolation = await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/stores/editor.ts'); const e=useEditorStore()
    const a=e.sceneRoots.find(o=>o.name==='Cabinet A'),b=e.sceneRoots.find(o=>o.name==='Cabinet B')
    return a.getObjectByName('Door override').material !== b.getObjectByName('BatteryDoor').material && b.getObjectByName('Body').material.emissive.getHex() === 0
  }); assert(isolation)
  // Error handling: no partial apply, missing node and Primitive/root incompatibility.
  const failures = await page.evaluate(async templateId => {
    const { LocalTemplateRepository } = await import('/src/infrastructure/effectTemplates/TemplateRepository.ts')
    const { prepareTemplateApplication } = await import('/src/editor/services/applyEffectTemplate.ts')
    const { useEditorStore } = await import('/src/stores/editor.ts')
    const repo=new LocalTemplateRepository(),template=await repo.get(templateId),e=useEditorStore()
    let primitive=false,missing=false,builtin=false,duplicate=false
    try { prepareTemplateApplication(template,e.sceneRoots[0],e.sceneRoots) } catch { primitive=true }
    template.effects[1].target.assetNodeId='missing-node'
    try { prepareTemplateApplication(template,e.sceneRoots.find(o=>o.name==='Cabinet A'),e.sceneRoots) } catch { missing=true }
    try { await repo.remove('builtin:critical') } catch { builtin=true }
    template.effects=[template.effects[0],{...template.effects[0],id:'duplicate'}]
    try { prepareTemplateApplication(template,e.sceneRoots.find(o=>o.name==='Cabinet A'),e.sceneRoots) } catch { duplicate=true }
    return {primitive,missing,builtin,duplicate}
  },templateId)
  assert(Object.values(failures).every(Boolean))

  const beforeDelete = await snapshot()
  await relative.getByTestId('edit-template').click()
  await page.getByTestId('template-atom-0-padding').fill('1.7')
  await page.getByTestId('template-atom-0-padding').press('Tab')
  await page.getByTestId('save-template').click()
  assert.deepEqual(await snapshot(),beforeDelete) // weak provenance, no auto-sync
  await page.evaluate(async()=>{const {useEditorStore}=await import('/src/stores/editor.ts');useEditorStore().deleteSelected()})
  assert.equal((await snapshot()).filter(e=>e.target.instanceId===two.find(e=>e.target.instanceId!==two[0].target.instanceId).target.instanceId).length,0)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.deepEqual(new Set((await snapshot()).map(e=>e.id)),new Set(beforeDelete.map(e=>e.id)))
  // Delete template resource: already applied scene effects stay unchanged.
  await relative.getByTestId('delete-template').click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await relative.waitFor({state:'detached'})
  assert.equal((await snapshot()).length,beforeDelete.length)
  await page.getByRole('button',{name:'保存 *',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[data-testid="editor-viewport"]').dataset.sceneDirty==='false')
  const saved = await page.evaluate(id=>JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)),projectId)
  assert(!('templates' in saved));assert(saved.effects.some(e=>e.sourceTemplateId===templateId))
  await page.reload();await ready();await page.getByTestId('templates-tab').click()
  await page.locator('[data-template-id]').filter({hasText:'Custom warning'}).waitFor()
  assert.deepEqual(await snapshot(),saved.effects)
  await page.screenshot({path:'/tmp/twin-templates-k1.png'})
  await navigate(`/editor/${projectId}-template-isolation`);await ready()
  await page.getByTestId('templates-tab').click()
  await page.locator('[data-template-id]').filter({hasText:'Custom warning'}).waitFor()
  assert.equal((await snapshot()).length,0) // resource shared, scene effects isolated
  // Corrupt the independent template repository; Viewer must not read it at all.
  await page.evaluate(()=>localStorage.setItem('digital-twin-studio:effect-templates:v1','INVALID JSON'))
  const requests=[]
  const listener=request=>requests.push(request.url())
  page.on('request',listener)
  await page.goto(`${new URL(page.url()).origin}/dev/viewer?projectId=${projectId}`)
  await page.waitForFunction(()=>document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded==='true')
  // K2 may use pure template expansion on embedded recipes, never the resource repository/UI.
  assert(!requests.some(url=>/infrastructure\/effectTemplates|stores\/effectTemplates|EffectTemplateLibrary|applyEffectTemplate/.test(url)))
  const viewer=await page.evaluate(saved=>{
    const api=document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed
    const roots=saved.instances.map(i=>api.getRuntimeObject({type:'asset-instance',instanceId:i.instanceId}))
    return {helpers:roots[0].parent.getObjectByName('Runtime Effects').children.length,isolated:roots[0].getObjectByName('Door override').material!==roots[1].getObjectByName('BatteryDoor').material}
  },saved)
  assert(viewer.isolated);assert.equal(viewer.helpers,saved.effects.filter(e=>['box-glow','ground-pulse','floating-label'].includes(e.kind)).length)
  page.off('request',listener)
  await navigate('/projects');await page.waitForTimeout(300)
  assert.deepEqual(await page.evaluate(()=>window.qaResources()),{urls:0,raf:0})
  return {crud:'PASS',batchUndoRedo:'PASS',relativeTargets:'PASS',materialIsolation:isolation,failures,saveReload:'PASS',viewerWithoutRepository:'PASS',viewer,dispose:'PASS'}
}
