import assert from 'node:assert/strict'

export async function testVisualRules(page, projectId) {
  const navigate = async path => page.evaluate(async path => { await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path) },path)
  const ready = () => page.waitForFunction(()=>document.querySelector('[data-testid="editor-viewport"]')?.dataset.runtimeReady==='true')
  // K1 intentionally corrupts this test browser's template storage. Restore it for configuration.
  await page.evaluate(()=>{localStorage.removeItem('digital-twin-studio:effect-templates:v1');Math.random=()=>0.5})
  await navigate(`/editor/${projectId}`);await ready()
  await page.evaluate(async()=>{
    const {useEditorStore}=await import('/src/stores/editor.ts');const e=useEditorStore();e.selectObject(e.sceneRoots.find(o=>o.name==='Cabinet A'))
    const {LocalTemplateRepository}=await import('/src/infrastructure/effectTemplates/TemplateRepository.ts')
    const {getBuiltinTemplates}=await import('/src/domain/effectTemplates/builtins.ts')
    const repo=new LocalTemplateRepository()
    for(const [id,name,color] of [['low-soc','低 SOC','#0033ff'],['fault','故障告警','#ff00ff']]) {
      const t=getBuiltinTemplates()[0];t.id=id;t.origin='local';t.name=name;t.effects.forEach(e=>{e.parameters.color=color;e.parameters.text=name});await repo.save(t)
    }
  })
  async function add(variable,operator,value,template,priority) {
    await page.getByTestId('add-visual-rule').click()
    await page.getByTestId('rule-variable').selectOption(variable)
    await page.getByTestId('rule-operator').selectOption(operator)
    const input=page.getByTestId('rule-operand')
    if(variable==='alarm') await input.selectOption(value);else await input.fill(value)
    await page.getByTestId('rule-template').selectOption(template)
    await page.getByTestId('rule-priority').fill(String(priority))
    await page.getByTestId('save-visual-rule').click()
  }
  await add('temperature','>','60','builtin:critical',20)
  await add('soc','<','20','low-soc',25)
  await add('alarm','==','true','fault',30)
  await add('status','==','standby','builtin:selected',5)
  await add('temperature','>','50','builtin:warning',10)
  const configs=await page.evaluate(async()=>{const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().rules})
  assert.equal(configs.length,5)
  const high=configs.find(r=>r.priority===20),low=configs.find(r=>r.priority===25),fault=configs.find(r=>r.priority===30),warning=configs.find(r=>r.priority===10)
  const manual=await page.evaluate(async()=>{const {useEffectsStore}=await import('/src/stores/effects.ts');return useEffectsStore().instances})
  await page.getByRole('button',{name:'保存 *',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[data-testid="editor-viewport"]').dataset.sceneDirty==='false')

  async function values(temperature,soc=80,alarm=false,status='running') {
    return page.evaluate(async ({temperature,soc,alarm,status})=>{
      const {useTwinStore}=await import('/src/stores/twin.ts');const twin=useTwinStore()
      const binding=twin.bindings.find(b=>b.device.id==='ESS-001')
      for(const [key,value] of Object.entries({temperature,soc,alarm,status})) twin.setRuntimeValue(binding.id,key,value)
      const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().diagnostics
    },{temperature,soc,alarm,status})
  }
  let diag=await values(67)
  assert.equal(diag[high.id].status,'active');assert.equal(diag[high.id].visibleEffects,4);assert.equal(diag[warning.id].visibleEffects,0)
  await page.evaluate(async id=>{
    const {useEditorStore}=await import('/src/stores/editor.ts');window.qaRuleHelper=useEditorStore().sceneRoots[0].parent.getObjectByName(`Effect:rule:${id}:0`)
    if(!window.qaRuleHelper)throw new Error('High rule did not render')
  },high.id)
  await values(70)
  assert(await page.evaluate(async id=>{const {useEditorStore}=await import('/src/stores/editor.ts');return window.qaRuleHelper===useEditorStore().sceneRoots[0].parent.getObjectByName(`Effect:rule:${id}:0`)},high.id))
  diag=await values(55);assert.equal(diag[high.id].status,'inactive');assert.equal(diag[warning.id].visibleEffects,2)
  diag=await values(40,10,true,'standby');assert.equal(diag[fault.id].visibleEffects,4);assert.equal(diag[low.id].visibleEffects,0)
  diag=await values(40,10,false);assert.equal(diag[low.id].visibleEffects,4)
  diag=await values(40);assert(Object.values(diag).every(d=>d.status==='inactive'))
  const unchanged=await page.evaluate(async()=>{const {useEffectsStore}=await import('/src/stores/effects.ts');const {useEditorStore}=await import('/src/stores/editor.ts');return {effects:useEffectsStore().instances,dirty:useEditorStore().isDirty}})
  assert.deepEqual(unchanged.effects,manual);assert.equal(await page.getByTestId('editor-viewport').getAttribute('data-scene-dirty'),'false')
  // No runtime history: Undo still removes the last configured rule in one step.
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.equal(await page.locator('[data-rule-id]').count(),4)
  await page.getByRole('button',{name:'重做',exact:true}).click()
  assert.equal(await page.locator('[data-rule-id]').count(),5)
  await values(67)
  const highRow=page.locator(`[data-rule-id="${high.id}"]`)
  await highRow.scrollIntoViewIfNeeded()
  await page.screenshot({path:'/tmp/twin-visual-rules-k2.png'})
  await highRow.getByTestId('toggle-visual-rule').click()
  assert.equal(await highRow.getAttribute('data-status'),'disabled')
  await highRow.getByTestId('toggle-visual-rule').click()
  await highRow.getByTestId('edit-visual-rule').click()
  await page.getByTestId('rule-operand').fill('61')
  await page.getByTestId('save-visual-rule').click()
  assert((await highRow.textContent()).includes('61'))
  await highRow.getByTestId('delete-visual-rule').click()
  assert.equal(await highRow.count(),0)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await values(67)
  // Unbinding leaves visible unresolved config, but clears all temporary effects.
  const binding=await page.evaluate(async()=>{const {useTwinStore}=await import('/src/stores/twin.ts');return useTwinStore().bindings.find(b=>b.device.id==='ESS-001')})
  await page.getByTestId('unbind-twin-device').click()
  assert.equal(await highRow.getAttribute('data-status'),'unresolved')
  await page.evaluate(async binding=>{const {useTwinStore}=await import('/src/stores/twin.ts');useTwinStore().upsertBinding(binding)},binding)
  await values(67)
  await page.evaluate(async()=>{const {useEditorStore}=await import('/src/stores/editor.ts');useEditorStore().deleteSelected()})
  assert.equal(await page.evaluate(async()=>{const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().rules.length}),0)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  assert.equal(await page.locator('[data-rule-id]').count(),5)
  await page.getByRole('button',{name:'保存 *',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[data-testid="editor-viewport"]').dataset.sceneDirty==='false')
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`digital-twin-studio:scene:v1:${id}`)),projectId)
  assert.equal(saved.visualRules.length,5);assert.deepEqual([...saved.effects].sort((a,b)=>a.id.localeCompare(b.id)),[...manual].sort((a,b)=>a.id.localeCompare(b.id)))
  assert(!JSON.stringify(saved).includes('visibleEffects'));assert(!JSON.stringify(saved.effects).includes('rule:'))
  await page.reload();await ready()
  assert.equal(await page.evaluate(async()=>{const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().rules.length}),5)
  // Controlled actual MockDataSource ticks, not direct value injection.
  await page.evaluate(()=>{Math.random=()=>0.95})
  await page.waitForFunction(async id=>{const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().diagnostics[id]?.status==='active'},high.id)
  await page.evaluate(()=>{Math.random=()=>0.5})
  await page.waitForFunction(async id=>{const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().diagnostics[id]?.status==='inactive'},high.id)
  await page.evaluate(()=>localStorage.setItem('digital-twin-studio:effect-templates:v1','BROKEN'))
  await navigate(`/dev/viewer?projectId=${projectId}`)
  await page.waitForFunction(()=>document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded==='true')
  assert.equal(await page.getByTestId('visual-rule-section').count(),0)
  await page.evaluate(()=>{Math.random=()=>0.95})
  await page.waitForFunction(id=>document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed.getRuleDiagnostics().rules[id]?.status==='active',high.id)
  const activationCount=await page.evaluate(()=>document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed.getRuleDiagnostics().activations)
  await page.waitForTimeout(1200)
  assert.equal(await page.evaluate(()=>document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed.getRuleDiagnostics().activations),activationCount)
  await page.evaluate(()=>{Math.random=()=>0.5})
  await page.waitForFunction(id=>document.querySelector('[data-testid="twin-scene-viewer"]').__vueParentComponent.exposed.getRuleDiagnostics().rules[id]?.status==='inactive',high.id)
  const lifecycle=[]
  for(let i=0;i<3;i++) {
    await navigate('/projects');await page.waitForTimeout(200)
    const stats=await page.evaluate(async()=>{const {getVisualRuleDiagnostics}=await import('/src/runtime/effects/VisualRuleRuntime.ts');return {...getVisualRuleDiagnostics(),...window.qaResources()}})
    assert.deepEqual(stats,{subscriptions:0,urls:0,raf:0});lifecycle.push(stats)
    await navigate(`/dev/viewer?projectId=${projectId}`)
    await page.waitForFunction(()=>document.querySelector('[data-testid="twin-scene-viewer"]')?.dataset.loaded==='true')
  }
  await navigate('/projects')
  const missing=await page.evaluate(async saved=>{
    const {TwinSceneRuntime}=await import('/src/runtime/twin/TwinSceneRuntime.ts')
    const {IndexedDbAssetRepository}=await import('/src/infrastructure/assets/index.ts')
    const {evaluateCondition}=await import('/src/domain/visualRules/index.ts')
    const checks=[['>',2,1,true],['>=',1,1,true],['<',1,2,true],['<=',1,1,true],['==',1,1,true],['!=',1,2,true]]
    if(!checks.every(([operator,value,threshold,expected])=>evaluateCondition({dataType:'number',operator,value:threshold},value)===expected))throw new Error('Operator test failed')
    if(evaluateCondition({dataType:'number',operator:'!=',value:1},NaN)||evaluateCondition({dataType:'number',operator:'!=',value:1},'2'))throw new Error('Type coercion')
    Math.random=()=>0.95
    const document=structuredClone(saved),base=document.visualRules.find(r=>r.priority===20)
    document.visualRules=[
      {...structuredClone(base),id:'missing-target',target:{type:'primitive',nodeId:'missing'}},
      {...structuredClone(base),id:'missing-binding',bindingId:'missing'},
      {...structuredClone(base),id:'missing-variable',variableKey:'missing'},
      {...structuredClone(base),id:'missing-template',template:null},
      {...structuredClone(base),id:'missing-child'},
    ]
    document.visualRules[4].template.effects[0].target={mode:'asset-node',assetNodeId:'missing'}
    const canvas=window.document.createElement('canvas');canvas.style.cssText='width:400px;height:300px';window.document.body.append(canvas)
    const runtime=new TwinSceneRuntime(canvas,{load:async()=>document,save:async()=>{}},new IndexedDbAssetRepository(),()=>{})
    try {
      await runtime.load(document.projectId)
      const diagnostics=runtime.visualRules.getDiagnostics()
      if(!Object.values(diagnostics.rules).every(d=>d.status==='unresolved'))throw new Error('Missing references not unresolved')
      runtime.twin.setMockRunning(false)
      if(!Object.values(runtime.visualRules.getDiagnostics().rules).every(d=>d.status==='stopped'))throw new Error('Stop did not deactivate')
      return diagnostics
    } finally {runtime.dispose();canvas.remove()}
  },saved)
  assert.deepEqual(await page.evaluate(()=>window.qaResources()),{urls:0,raf:0})
  const editorLifecycle=[]
  for(let i=0;i<3;i++) {
    await navigate(`/editor/${projectId}`);await ready()
    await navigate('/projects');await page.waitForTimeout(200)
    const stats=await page.evaluate(async()=>{
      const {getVisualRuleDiagnostics}=await import('/src/runtime/effects/VisualRuleRuntime.ts')
      const {getMockDataSourceDiagnostics}=await import('/src/infrastructure/data/MockDataSource.ts')
      return {...getVisualRuleDiagnostics(),...getMockDataSourceDiagnostics(),...window.qaResources()}
    })
    assert.deepEqual(stats,{subscriptions:0,activeTimerCount:0,urls:0,raf:0});editorLifecycle.push(stats)
  }
  await navigate(`/editor/${projectId}-empty`);await ready()
  assert.equal(await page.evaluate(async()=>{const {useVisualRulesStore}=await import('/src/stores/visualRules.ts');return useVisualRulesStore().rules.length}),0)
  await navigate('/projects')
  return {conditions:'PASS number/boolean/string and six numeric operators',transitions:'PASS',stableActive:'PASS',ownership:'PASS',priority:'PASS',history:'PASS',deleteBindingAndTarget:'PASS',saveReload:'PASS',mockTicks:'PASS',selfContainedViewer:'PASS',missing,lifecycle,editorLifecycle,projectIsolation:'PASS'}
}
