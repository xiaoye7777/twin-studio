# Project Package v1

项目管理顶部「导入项目」，项目卡片菜单「导出项目」。导出读取已保存版本，未保存的 Editor 变更不在包内。尚未保存场景的项目需先保存。

```text
<项目名>.twin.zip
  manifest.json
  scene.json
  assets/0.glb
  assets/1.hdr
```

Manifest:

```json
{
  "format": "twin-studio-project",
  "packageVersion": 1,
  "exportedAt": "2026-09-22T00:00:00.000Z",
  "project": { "id": "original-id", "name": "园区", "createdAt": "...", "updatedAt": "..." },
  "scene": { "path": "scene.json", "sha256": "64位十六进制摘要" },
  "assets": [{
    "id": "original-asset-id", "path": "assets/0.glb", "name": "cabinet.glb",
    "assetType": "model", "mimeType": "model/gltf-binary", "size": 1234,
    "sha256": "64位十六进制摘要", "lastModified": 0, "createdAt": "..."
  }]
}
```

`packageVersion` 独立于 `scene.json` 的 `version`。当前仅支持 Package v1 + SceneDocumentV1。场景保留 Binding、手工 Effects、包含模板快照的 Visual Rules、Interactions、稳定 Target、Camera、Settings 和节点 override/deletion。实时值、Hover、Runtime 显隐和 History 不导出。

依赖集中在 `collectSceneAssets()`：模型 `instances[].assetId` 与 `sceneSettings.environmentAssetId`。同一资产多实例仅打包一次。增加有真实资产引用的新 Schema 字段时，必须同时扩展该收集器和导入 ID remap。全局 TemplateRepository 不打包；规则自带快照、手工效果已展开，Viewer 无模板库依赖。来源 templateId 仅作溯源，用户模板库不会因导入被修改。

## 导入与 ID

每次导入都创建新 projectId 和新 assetId，只重映射场景资产引用。instanceId、nodeId、assetNodeId、bindingId、effectId、ruleId、interactionId 与 runtimeBid 保持原值：这些记录均限定在单个 Scene/Runtime 中。项目卡片名附加「（导入）」，封面使用本地默认样式，不带外部封面 URL。

第一版不做跨包资产去重。原有 name/size/lastModified fingerprint 不是内容校验，不能安全判断同一个文件；导入记录使用本次项目隔离的 `package:<projectId>:<assetId>` fingerprint。重复导入会占用额外存储，但不会覆盖已有资源。包内重复资产 ID、重复路径拒绝；相同 SHA 的不同逻辑资产允许存在。

## 校验与提交

完整读取和校验后才提交：ZIP 路径白名单、重复路径、文件数和解压大小、manifest/version、Scene Schema、业务 ID 唯一性、依赖完整性、大小、SHA-256、GLB/HDR 格式。GLB 不允许外部 URI（仅内嵌 buffer/texture 或 data URI）。不执行脚本，不读取 URL 或文件系统路径。摘要用于发现损坏，不是数字签名。

Prepare 后，资产使用单个 IndexedDB transaction，场景写 SceneRepository，再持久化并发布项目卡片。普通写入失败会删除本次新增场景和资产，不触碰已有项目。localStorage 与 IndexedDB 不能共同参与原子事务：浏览器进程在提交中途崩溃时可能留下未引用资产；此版本没有崩溃恢复日志。回滚本身失败会明确报错。

## 限制与运行边界

- 仅当前平台支持的自包含 GLB 2.0、Radiance HDR；不迁移外链 GLTF、外部图片或全局模板库。
- ZIP 与总解压大小各 256 MiB；单资源 128 MiB；单 JSON 8 MiB；最多 512 文件；HDR 最多 16M 像素。导出压缩使用 fflate 异步 ZIP，导入分块解压并限制实际字节数，仍在内存准备资源，适合本地 Demo 中小项目。
- 基本二进制与自包含检查不等于完整 GLTF 渲染兼容性认证，特殊扩展仍受当前 Runtime 支持范围约束。
- PackageService 通过 Repository 读写。SceneRuntimeLoader / Editor / TwinSceneViewer 继续只从 Repository 加载，完全不感知 ZIP。
- 未来 DataSource 的持久配置可加入 SceneDocument 和相应校验；连接密钥、实时值、订阅对象不应进入包。此阶段不引入数据源协议。
