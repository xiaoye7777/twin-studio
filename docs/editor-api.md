# 3D 编辑器后端接口（草案）

> **状态：讨论稿 v0.1。** 第 5～11 章的路径和字段是给后端的提案，定稿前都可以改。第 12 章的设备数据协议例外：前端已经按它实现，改动要两边一起评估。需要一起拍板的问题集中在[第 14 章](#14-待确认的问题)。

## 1. 范围

前端目前没有业务后端，所有数据都存在浏览器里，换一台电脑就看不到。这份文档定义把这些数据搬到后端需要的接口。

**包含：** 登录、项目、场景保存、模型和环境贴图、历史版本、我的组件、特效模板、设备实时数据。

**不包含：**

- 数据大屏（`/screens`、`ScreenDocument`）。大屏里的三维组件读的是同一套场景和模型接口，不用另开。
- 「数据接口」页面（登记数据服务和接口）的增删改。3D 场景只依赖其中的认证引用，见[第 14 章](#14-待确认的问题)第 6 条。
- 设备控制。前端没有向设备下发指令的代码，第 12 章的数据流只有读取方向。

## 2. 后端要接管哪些数据

| 数据 | 现在存在哪 | 前端代码 | 对应章节 |
| --- | --- | --- | --- |
| 登录 | 没有真实登录，任意账号都能进 | [Login.vue](../apps/editor/src/views/login/Login.vue) | 第 5 章 |
| 项目列表 | localStorage `digital-twin-studio-projects` | [stores/project.ts](../apps/editor/src/stores/project.ts) | 第 6 章 |
| 场景 JSON | localStorage `digital-twin-studio:scene:v1:<projectId>` | [LocalSceneRepository.ts](../apps/editor/src/infrastructure/scenes/LocalSceneRepository.ts) | 第 7 章 |
| 模型、环境贴图 | IndexedDB `digital-twin-studio-assets` | [IndexedDbAssetRepository.ts](../apps/editor/src/infrastructure/assets/IndexedDbAssetRepository.ts) | 第 8 章 |
| 历史版本 | IndexedDB `digital-twin-studio-history` | [SceneHistoryRepository.ts](../apps/editor/src/infrastructure/history/SceneHistoryRepository.ts) | 第 9 章 |
| 我的组件 | IndexedDB `digital-twin-studio-components` | [ComponentRepository.ts](../apps/editor/src/infrastructure/components/ComponentRepository.ts) | 第 10 章 |
| 特效模板 | localStorage `digital-twin-studio:effect-templates:v1` | [TemplateRepository.ts](../apps/editor/src/infrastructure/effectTemplates/TemplateRepository.ts) | 第 11 章 |

留在浏览器、不需要接口的：界面主题、编辑器面板布局、模型缩略图缓存。

**数据量参考**（实测「储能电站示例」）：

| 项目 | 数值 |
| --- | --- |
| 节点 | 196 个，其中模型 90 个，用到 19 个不同的模型文件 |
| 场景 JSON | 约 142 KB |
| 19 个模型文件 | 合计约 7.1 MB，最大 1.2 MB |
| 封面图 | 480 px 宽 JPEG，约 60 KB |

**场景对后端是一份不透明的 JSON。** 节点、特效、规则这些内容都由前端解释，后端只需要原样保存，读少数几个字段（见[第 7 章](#7-场景)和[第 8.5 节](#85-查询引用)）。

## 3. 接口总览

路径都以 `/api/v1` 开头。可以分批上线，每批前端换一个存储实现，没换的部分继续用浏览器存储。

| 方法 | 路径 | 作用 | 批次 |
| --- | --- | --- | --- |
| POST | `/auth/login` | 登录 | 第一批 |
| POST | `/auth/logout` | 退出 | 第一批 |
| GET | `/auth/me` | 当前用户 | 第一批 |
| GET | `/projects` | 项目列表 | 第一批 |
| POST | `/projects` | 新建项目 | 第一批 |
| GET | `/projects/{projectId}` | 项目详情 | 第一批 |
| PATCH | `/projects/{projectId}` | 重命名 | 第一批 |
| DELETE | `/projects/{projectId}` | 删除项目 | 第一批 |
| GET | `/projects/{projectId}/scene` | 读取场景 | 第一批 |
| PUT | `/projects/{projectId}/scene` | 保存场景 | 第一批 |
| GET | `/assets` | 资源列表 | 第一批 |
| POST | `/assets` | 上传资源 | 第一批 |
| GET | `/assets/{assetId}` | 资源信息 | 第一批 |
| GET | `/assets/{assetId}/content` | 下载文件 | 第一批 |
| DELETE | `/assets/{assetId}` | 删除资源 | 第一批 |
| GET | `/assets/{assetId}/usages` | 查询引用 | 第一批 |
| PUT | `/projects/{projectId}/cover` | 上传封面 | 第二批 |
| GET | `/projects/{projectId}/cover` | 读取封面 | 第二批 |
| POST | `/assets/lookup` | 上传前按摘要查重 | 第二批 |
| GET | `/projects/{projectId}/versions` | 版本列表 | 第二批 |
| POST | `/projects/{projectId}/versions` | 新建版本 | 第二批 |
| GET | `/projects/{projectId}/versions/{versionId}/document` | 读取版本内容 | 第二批 |
| DELETE | `/projects/{projectId}/versions/{versionId}` | 删除版本 | 第二批 |
| GET | `/components` | 组件列表 | 第二批 |
| POST | `/components` | 保存组件 | 第二批 |
| GET | `/components/{componentId}` | 组件详情 | 第二批 |
| DELETE | `/components/{componentId}` | 删除组件 | 第二批 |
| GET | `/effect-templates` | 模板列表 | 第二批 |
| PUT | `/effect-templates/{templateId}` | 保存模板 | 第二批 |
| DELETE | `/effect-templates/{templateId}` | 删除模板 | 第二批 |

## 4. 通用约定

### 4.1 返回格式

JSON 接口都用下面的包装，`code` 为 `0` 表示成功。HTTP 状态码同样要反映结果，不要失败时也返回 200。文件下载接口直接返回文件内容。

```json
{ "code": 0, "msg": "ok", "data": { "id": "p_01" } }
```

前端会把 `msg` 直接显示给用户，所以要写成用户能看懂的中文。

### 4.2 错误码

| HTTP | code | 含义 | 前端行为 |
| --- | --- | --- | --- |
| 400 | 40000 | 参数错误 | 显示 `msg` |
| 401 | 40100 | 未登录或登录已过期 | 提示重新登录 |
| 403 | 40300 | 没有权限 | 显示 `msg` |
| 404 | 40400 | 资源不存在 | 显示 `msg` |
| 409 | 40901 | 场景版本冲突 | 让用户选择，见[第 7.3 节](#73-版本冲突) |
| 409 | 40902 | 资源正在被使用 | 列出使用方，让用户确认 |
| 413 | 41300 | 超过大小限制 | 显示 `msg` |
| 422 | 42201 | 文件不是有效的 GLB 或 HDR | 显示 `msg` |
| 500 | 50000 | 服务器错误 | 显示 `msg` |

### 4.3 字段规则

- **ID 一律是字符串。** 如果数据库用 64 位整数，JSON 里也要转成字符串，否则 JavaScript 会丢精度。只用字母、数字、`_`、`-`，因为 ID 要放进 URL。
- **时间用 ISO 8601 的 UTC 格式**，如 `2026-11-04T08:30:00.000Z`。
- **列表第一版不分页**，前端一次取全部。以后数据多了再加 `page`、`pageSize`。

### 4.4 大小限制

| 内容 | 上限 | 依据 |
| --- | --- | --- |
| 场景 JSON、版本内容 | 8 MiB | 和项目包的 JSON 上限一致，超过就无法导出 |
| 单个模型或 HDR 文件 | 128 MiB | 和项目包的单文件上限一致 |
| HDR 分辨率 | 不超过 16 × 1024² 像素 | 项目包校验规则 |
| 封面图 | 1 MiB | 提案 |

网关（如 Nginx 的 `client_max_body_size`）要放到比这些上限略大。JSON 响应建议开 gzip，下载和上传建议走 HTTP/2，打开一个场景要并行取很多文件。

## 5. 登录

建议同域部署并使用 HttpOnly Cookie，理由见[第 14 章](#14-待确认的问题)第 1 条。下面按 Cookie 方式写，如果改用 Bearer Token，只需要在登录响应里加 `token`。

### `POST /auth/login`

```json
{ "username": "demo", "password": "******" }
```

成功时通过 `Set-Cookie` 下发登录态，返回用户信息：

```json
{
  "code": 0,
  "msg": "ok",
  "data": { "user": { "id": "u_01", "username": "demo", "displayName": "示例用户" } }
}
```

### `POST /auth/logout`

清除登录态，`data` 为 `null`。

### `GET /auth/me`

已登录时返回和登录相同的 `data`，未登录返回 401。前端启动时用它判断登录状态。

## 6. 项目

### 6.1 项目对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 后端生成 |
| `name` | string | 去掉首尾空格后不能为空，最长 200。界面上新建和重命名限制为 2～40 个字符，导入项目包时最长 200 |
| `coverUrl` | string \| null | 封面地址，没有封面时为 `null` |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 最后修改时间，规则见下 |

**`updatedAt` 什么时候变：** 保存场景和重命名时更新，上传封面时不更新。卡片上显示的修改时间依赖这条规则，否则仅仅打开项目也会变成“刚刚修改”。

### 6.2 `GET /projects`

返回当前用户可见的项目，按 `createdAt` 升序，和现在卡片的顺序一致。

```json
{
  "code": 0,
  "msg": "ok",
  "data": [
    {
      "id": "p_01",
      "name": "储能电站示例",
      "coverUrl": "/api/v1/projects/p_01/cover?v=3",
      "createdAt": "2026-11-04T08:00:00.000Z",
      "updatedAt": "2026-11-04T08:30:00.000Z"
    }
  ]
}
```

### 6.3 `POST /projects`

请求 `{ "name": "新项目" }`，返回项目对象。新项目还没有场景，读取场景时 `document` 为 `null`，前端第一次保存时才写入。后端不需要创建默认场景。

「生成案例」和「导入项目包」都是前端组合调用 `POST /projects`、`POST /assets`、`PUT .../scene` 完成的，不需要专门的接口。

### 6.4 `GET /projects/{projectId}`

返回项目对象。

### 6.5 `PATCH /projects/{projectId}`

请求 `{ "name": "新名字" }`，返回项目对象。场景 JSON 里的 `metadata.name` 要等下次保存才会更新，**项目名以这里为准**。

### 6.6 `DELETE /projects/{projectId}`

删除项目、场景、全部历史版本和封面。**不删除模型文件**，模型属于资源库，可能被其他项目使用。

### 6.7 封面（第二批）

`PUT /projects/{projectId}/cover`：请求体是图片本身，`Content-Type: image/jpeg`，返回 `{ "coverUrl": "..." }`，不改变 `updatedAt`。

`GET /projects/{projectId}/cover`：返回图片。`coverUrl` 建议带版本参数，方便浏览器缓存。

封面不放进项目对象，是因为列表要一次返回所有项目，每张约 60 KB，放在一起太大。现在前端在打开项目 2.5 秒后和每次保存后都会更新封面，对接时前端会限制上传频率。

## 7. 场景

### 7.1 `GET /projects/{projectId}/scene`

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "revision": 12,
    "updatedAt": "2026-11-04T08:30:00.000Z",
    "document": { "version": 2, "projectId": "p_01", "说明": "完整结构见附录 A" }
  }
}
```

还没保存过时返回 200，`revision` 为 `0`，`document` 为 `null`。只有项目不存在才返回 404。

### 7.2 `PUT /projects/{projectId}/scene`

```json
{
  "baseRevision": 12,
  "saveId": "3f1c9a52-6c0e-4a7b-9d1e-0a5b8f2c7e11",
  "document": { "version": 2, "projectId": "p_01", "说明": "完整结构见附录 A" }
}
```

| 字段 | 说明 |
| --- | --- |
| `baseRevision` | 这份修改基于哪个版本。第一次保存传 `0` |
| `saveId` | 前端为每次保存生成的 ID，重试时不变。如果和最近一次成功保存的 `saveId` 相同，直接返回那次的结果，避免网络重试被误判成冲突 |
| `document` | 整份场景 JSON，每次都是全量 |

成功返回 `revision`（原值加 1）和 `updatedAt`，同时更新项目的 `updatedAt`：

```json
{ "code": 0, "msg": "ok", "data": { "revision": 13, "updatedAt": "2026-11-04T08:31:00.000Z" } }
```

**调用频率：** 编辑停止 1.5 秒后自动保存一次，离开编辑器时再保存一次。连续编辑时每分钟最多约 40 次全量请求，所以限流不要低于每分钟 60 次。前端保证同一个编辑器同时只有一个保存请求。

**后端要检查的：**

| 规则 | 不满足时 |
| --- | --- |
| `document.projectId` 等于路径里的 `projectId` | 400 |
| `document.version` 是正整数（当前是 2） | 400 |
| 序列化后不超过 8 MiB | 413 |
| `baseRevision` 等于当前版本 | 409，见下节 |

**后端不要做的：**

- **不要改写 `document`。** 保存什么就返回什么。`nodes` 等数组的顺序有含义（如兄弟节点的先后），用 JSONB 或文本存都可以，但数组顺序不能变。
- **不要因为模型不存在而拒绝保存。** 前端能打开缺模型的场景并给出提示，拒绝保存反而会让用户的修改丢失。
- **不要默认用严格的 JSON Schema 拒绝请求。** 前端每次保存前都用同一套规则校验过。[JSON Schema](schema/scene-document.v2.schema.json) 不允许未知字段，后端严格校验的话，前端加一个字段就要求后端同时升级。是否校验见[第 14 章](#14-待确认的问题)第 4 条。
- **不要往 `document` 里写任何账号、密码或 Token。** 场景文件会随项目包分发。

旧版本的场景（`version` 为 1）由前端读取时自动升级，下次保存就变成新版本，后端不用处理迁移。

### 7.3 版本冲突

两个人（或同一个人的两个标签页）编辑同一项目时，后保存的一方收到 409：

```json
{
  "code": 40901,
  "msg": "场景已被其他人修改",
  "data": {
    "currentRevision": 14,
    "updatedAt": "2026-11-04T08:32:00.000Z",
    "updatedBy": { "id": "u_02", "displayName": "示例用户 2" }
  }
}
```

前端让用户选择“加载最新”或“覆盖”。覆盖就是把 `baseRevision` 改成 `currentRevision` 再保存一次，后端不需要专门的强制参数。

## 8. 模型和环境贴图

资源库跨项目共享，场景通过 `assetId` 引用文件。前端把文件整个下载下来再解析，不需要流式读取。

### 8.1 资源对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 后端生成 |
| `name` | string | 原始文件名，如 `cabinet.glb`，最长 255，不能含 `\`、`/` 和控制字符 |
| `assetType` | string | `model` 或 `environment` |
| `mimeType` | string | `model/gltf-binary` 或 `image/vnd.radiance` |
| `size` | number | 字节数 |
| `sha256` | string | 64 位小写十六进制摘要，后端计算 |
| `lastModified` | number | 文件修改时间（毫秒时间戳），由上传方提供，导出项目包时要用 |
| `createdAt` | string | 上传时间 |

### 8.2 `GET /assets`

查询参数 `type` 可选，取值 `model` 或 `environment`。按 `createdAt` 降序返回资源对象数组。

### 8.3 `POST /assets`

`multipart/form-data`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `file` | 是 | 文件内容 |
| `assetType` | 是 | `model` 或 `environment` |
| `lastModified` | 否 | 毫秒时间戳，默认 `0` |

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "isNew": true,
    "asset": {
      "id": "asset_01",
      "name": "cabinet.glb",
      "assetType": "model",
      "mimeType": "model/gltf-binary",
      "size": 1212564,
      "sha256": "9f2c1d7e4b6a8c3f0e5d2a1b7c9e8f6a4d3b2c1e0f9a8b7c6d5e4f3a2b1c0d9e",
      "lastModified": 0,
      "createdAt": "2026-11-04T08:00:00.000Z"
    }
  }
}
```

**去重：** 同一可见范围内 `assetType` 和 `sha256` 都相同时，不新建记录，返回已有资源和 `"isNew": false`（HTTP 200）；新建时 HTTP 201。界面会据此提示“已在资源库中”。必须去重的原因是：内置模型在第一次使用时会复制进用户的资源库，比如生成一次储能电站案例就要上传 19 个文件，不去重的话每次都会多一份。

**校验：**

| 类型 | 校验规则 |
| --- | --- |
| `model`（`.glb`） | 文件头是 `glTF`（`0x46546C67`），版本为 2，头部声明的长度等于文件长度；第一个 chunk 是 JSON，其中 `asset.version` 为 `2.0`；`buffers` 和 `images` 的 `uri` 只能是 base64 data URI，不能引用外部文件。Draco、Meshopt 压缩和 KTX2 贴图都允许 |
| `environment`（`.hdr`） | 文件头以 `#?RADIANCE` 或 `#?RGBE` 开头，能读出 `-Y 高 +X 宽` 的分辨率，总像素不超过上限 |

不通过返回 422。规则和前端的 [validatePortableAsset.ts](../packages/core/src/infrastructure/packages/validatePortableAsset.ts) 相同。现在前端只在导出和导入项目包时校验，后端校验后，坏文件在上传时就能发现。

### 8.4 读取

`GET /assets/{assetId}`：返回资源对象。

`GET /assets/{assetId}/content`：返回文件内容，要求带这些响应头：

```text
Content-Type: model/gltf-binary
Content-Length: 1212564
ETag: "<sha256>"
Cache-Control: private, max-age=31536000, immutable
```

- **文件内容不可变：** 同一个 `assetId` 的内容永远不变，所以可以长期缓存。
- **必须有 `Content-Length`：** 前端要用它显示下载进度。
- **要支持并发：** 打开场景时会同时请求所有用到的模型。

文件放在对象存储时，可以 302 跳转到预签名地址，但对象存储要配置跨域。

### 8.5 查询引用

`GET /assets/{assetId}/usages`：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "projects": [{ "id": "p_01", "name": "储能电站示例" }],
    "components": [{ "id": "component_01", "name": "储能柜组合" }],
    "versionCount": 3
  }
}
```

引用关系在保存时从 JSON 里取，这是后端唯一需要读懂场景内容的地方（前端对应的逻辑是 [`collectSceneAssets`](../packages/core/src/infrastructure/packages/packageFormat.ts)）：

- `nodes` 中 `kind` 为 `model` 的节点的 `model.assetId`；
- `settings.sky.mode` 为 `hdr` 时的 `settings.sky.hdrAssetId`；
- 组件的 `data.nodes` 用同样的规则。

### 8.6 `DELETE /assets/{assetId}`

被当前场景或组件引用时返回 409（`code` 为 40902），`data` 和查询引用相同。前端请用户确认后带 `?force=true` 再次请求。历史版本里的引用如何处理见[第 14 章](#14-待确认的问题)第 5 条。

### 8.7 `POST /assets/lookup`（第二批）

上传前按摘要查重，内置模型不必每次都传一遍。

请求 `{ "sha256": "...", "assetType": "model" }`，返回 `{ "asset": 资源对象 }`，没有时 `asset` 为 `null`。

## 9. 历史版本

每个项目保留最近 **30** 个版本（不分类型），超过时后端删除最旧的。版本内容由前端提交，因为“恢复前的版本”可能包含还没保存的修改。

**恢复版本不需要接口：** 前端读取版本内容，先把当前状态存为一个版本，再把内容当作一次普通编辑应用，然后走正常的保存。

### 9.1 版本对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 后端生成 |
| `projectId` | string | 所属项目 |
| `label` | string | 显示名，如 `手动保存`、`自动保存`、`恢复前的版本` 或用户输入的名字 |
| `kind` | string | `manual`、`auto` 或 `restore` |
| `nodeCount` | number | 节点数，后端取 `document.nodes.length` |
| `size` | number | 内容的字节数，后端计算 |
| `thumbnail` | string | 可选，200 px 宽 JPEG 的 data URL |
| `createdAt` | string | 后端生成 |

### 9.2 接口

`GET /projects/{projectId}/versions`：按 `createdAt` 降序返回版本对象数组，不含内容。

`POST /projects/{projectId}/versions`：

```json
{
  "label": "手动保存",
  "kind": "manual",
  "thumbnail": "data:image/jpeg;base64,/9j/4AAQ",
  "document": { "version": 2, "projectId": "p_01", "说明": "完整结构见附录 A" }
}
```

返回版本对象。什么时候创建：用户手动保存时；自动保存时，如果这次打开后还没存过版本，或者距上一个版本超过 10 分钟；用户在历史面板手动创建时；恢复版本之前。

`GET /projects/{projectId}/versions/{versionId}/document`：返回 `{ "document": { ... } }`，内容和提交时完全一致。

`DELETE /projects/{projectId}/versions/{versionId}`：`data` 为 `null`。

## 10. 我的组件

组件是用户从场景里保存的一组对象，可以拖进任何项目复用，所以和资源库一样跨项目共享。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 后端生成 |
| `name` | string | 组件名，不能为空 |
| `thumbnail` | string | 可选，240 px 宽 JPEG 的 data URL |
| `data` | object | 组件内容，包含 `nodes`、`bindings`、`effects`、`visualRules`、`interactions`。除了统计模型引用，后端原样保存 |
| `createdAt` | string | 后端生成 |

| 方法和路径 | 说明 |
| --- | --- |
| `GET /components` | 按 `createdAt` 降序返回。**要带 `data`**，资源面板用它显示内容摘要，点击后直接放进场景 |
| `POST /components` | 请求 `{ name, thumbnail, data }`，返回组件对象 |
| `GET /components/{componentId}` | 返回组件对象 |
| `DELETE /components/{componentId}` | `data` 为 `null` |

## 11. 特效模板

内置模板写在前端代码里，后端只保存用户自己的模板。模板的 `id` 由前端生成（`template_<uuid>`），所以保存用 `PUT`。

| 方法和路径 | 说明 |
| --- | --- |
| `GET /effect-templates` | 返回用户模板数组，不含内置模板 |
| `PUT /effect-templates/{templateId}` | 新建或覆盖，请求体是模板对象，返回同样的对象 |
| `DELETE /effect-templates/{templateId}` | `data` 为 `null` |

后端检查：路径的 `templateId` 等于请求体的 `id`；`id` 不能以 `builtin:` 开头；`origin` 必须是 `local`。不满足返回 400。

```json
{
  "version": 1,
  "id": "template_01",
  "origin": "local",
  "name": "严重告警",
  "description": "红色发光加描边",
  "category": "告警",
  "effects": [
    {
      "id": "critical:0",
      "kind": "box-glow",
      "target": { "mode": "current-target" },
      "parameters": { "color": "#ff3030", "opacity": 0.65, "speed": 1, "padding": 0.2, "text": "严重告警" }
    }
  ]
}
```

`name` 最长 80，`description` 最长 500，`category` 最长 40，`effects` 有 1～50 项。`effects` 的内容后端不用理解。

## 12. 设备数据协议

> 这一章**前端已经实现**，内容和代码一致。联调前可以运行 `pnpm simulator` 启动[设备模拟器](../tools/device-simulator/README.md)，它实现了同样的协议。

设备数据不走上面的业务接口。每个场景在 `dataSources` 字段里配置数据地址，**浏览器直接连接**。一个场景最多 64 个接口，同一变量有多个来源时以列表靠前的为准。

### 12.1 建议后端提供的接口

按下面的默认形式提供，前端不用任何额外配置。如果已有接口格式不同，可以用[第 12.5 节](#125-其他数据格式)的映射适配，不一定要改后端。

| 方式 | 地址 | 适用场景 |
| --- | --- | --- |
| WebSocket | `wss://<host>/realtime` | 有实时推送能力 |
| HTTP 定时请求 | `POST /api/devices/latest` | 没有推送服务 |

### 12.2 WebSocket

连接建立后，前端先发一条订阅消息，列出场景涉及的设备和变量（接口也可以配置成发送固定文本）。后端可以据此只推送这些设备，也可以忽略：

```json
{
  "type": "subscribe",
  "devices": [
    {
      "deviceId": "ESS-001",
      "variables": [
        { "key": "soc", "dataType": "number" },
        { "key": "alarm", "dataType": "boolean" },
        { "key": "status", "dataType": "string" }
      ]
    }
  ]
}
```

之后后端推送设备数据（格式见[第 12.4 节](#124-消息格式)）：

```json
[{ "deviceId": "ESS-001", "soc": 72, "alarm": false, "status": "running" }]
```

| 规则 | 说明 |
| --- | --- |
| 帧类型 | 只支持 JSON 文本帧，不支持二进制帧 |
| 推送内容 | 可以只推变化的变量，没推的变量保持原值 |
| 心跳 | 可选配置，由前端按固定间隔发送一段文本，后端要能忽略它 |
| 重连 | 断开后按 1、2、4、8、10 秒退避重连，之后保持 10 秒，重连后重新发送订阅 |
| 异常帧 | 无法解析的帧会被丢弃，不影响连接 |
| 断开时 | 前端清空这个接口提供的所有值，不留过期数据 |

### 12.3 HTTP 定时请求

请求方式、间隔（1～3600 秒，新建时默认 5 秒）、超时（1～120 秒，不配置时取间隔和 15 秒中较小的值）都可以配置。POST 请求体留空时，前端发送和 WebSocket 相同的订阅消息。

```json
{
  "code": 0,
  "msg": "ok",
  "data": [{ "deviceId": "ESS-001", "soc": 72, "alarm": false, "status": "running" }]
}
```

场景配置里 `resultPath` 填 `data`，表示设备数据在返回值的 `data` 字段下。

**失败判断。** 下面任何一种都算失败，前端清空这个接口的值，下一个周期照常重试：

- HTTP 状态码不是 2xx，或超时；
- 返回的不是 JSON；
- HTTP 200 但业务码表示失败。判断规则是：`success` 不为 `true`，且 `code`、`errcode` 或数字类型的 `status` 不是 `0`、`200`、`success`、`ok`、`true`（文字不分大小写）。错误提示取 `msg`、`message`、`errmsg` 或 `error`。接口配置 `envelope: "off"` 可以关闭这项判断。

### 12.4 消息格式

默认每条数据一台设备，可以是数组或单个对象。变量也可以放在 `values` 里：

```json
{ "deviceId": "ESS-001", "values": { "soc": 72 } }
```

| 规则 | 说明 |
| --- | --- |
| 设备匹配 | `deviceId` 必须和场景绑定的设备编号完全一致，否则这条数据被**静默忽略** |
| 变量匹配 | 字段名必须和绑定的变量 `key` 一致，多余的字段被忽略 |
| 数字变量 | 接受数字和文本形式的数字（`"72.5"`），其他值被忽略 |
| 布尔变量 | 接受 `true`、`false`、`1`、`0` 及它们的文本形式，其他值被忽略 |
| 文本变量 | 接受文本，数字和布尔值会转成文本 |

**设备离线要明确表达。** 消息里没有时间戳，前端也不判断数据新旧。连接正常但某台设备不再出现在数据里时，页面会一直显示它最后一次的值。建议给设备加一个 `online` 或 `status` 变量，由后端如实推送，见[第 14 章](#14-待确认的问题)第 7 条。

**数值只能来自真实数据。** 前端不会生成或补全数据，后端也不要用默认值填充没有采集到的变量，否则页面上看不出异常。

### 12.5 其他数据格式

已有接口的格式不同时，在场景的接口配置里写 `mapping`，不用改后端：

| `format` | 数据形状 | 可配置项 |
| --- | --- | --- |
| `device-row`（默认） | `[{ "deviceId": "ESS-001", "soc": 72 }]` | `deviceField`、`valuesPath` |
| `metric-row` | `[{ "deviceId": "ESS-001", "metric": "soc", "value": 72 }]` | `deviceField`、`metricField`、`valueField` |
| `device-map` | `{ "ESS-001": { "soc": 72 } }` | `valuesPath` |

`fields` 用来对照变量名，如 `{ "soc": "stateOfCharge" }`。字段都支持路径，如 `meta.code`。详细说明见[项目数据源](../apps/editor/docs/project-data-source.md)。

### 12.6 跨域和认证

- **跨域：** 浏览器直连，所以跨域部署时后端要配 CORS。POST JSON 和自定义请求头都会触发预检，要处理 `OPTIONS`。接口开启 `withCredentials` 时，要返回 `Access-Control-Allow-Credentials: true`，且 `Access-Control-Allow-Origin` 必须写具体域名。
- **协议：** HTTPS 页面只能连 `wss://` 和 `https://`。
- **地址：** HTTP 接口可以写 `/api/...` 这样的同域路径，WebSocket 必须写完整地址。
- **不能带密钥：** 场景文件会随项目包分发，地址、参数和请求头都不能带 Token，前端校验时会拒绝。目前 WebSocket 地址的查询参数还没有被检查，但同样不要用 `?token=` 传认证信息。
- **HTTP 认证：** 可以用同域 Cookie，或通过 `authRef` 引用「数据接口」页面登记的服务，Token 只留在本机。
- **WebSocket 认证：** 浏览器不允许给 WebSocket 加自定义请求头，所以目前只能用同域 Cookie。见[第 14 章](#14-待确认的问题)第 6 条。

## 13. 项目包

`.twin.zip` 的导入导出第一版继续由前端完成，后端不需要解析 ZIP。格式见[项目包文档](../apps/editor/docs/project-package.md)。

| 操作 | 前端调用 |
| --- | --- |
| 导出 | `GET .../scene`，再为每个依赖调用 `GET /assets/{id}` 和 `GET /assets/{id}/content`，然后在浏览器里打包 |
| 导入 | 校验后依次调用 `POST /projects`、`POST /assets`（每个文件一次）、`PUT .../scene`。中途失败时，删除这次新建的项目和 `isNew` 为 `true` 的资源 |

**迁移现有数据：** 用户在旧版本导出项目包，登录新版本后导入。组件和特效模板不在项目包里，需要另外处理。

以后如果需要由服务器生成项目包给大屏使用，再增加 `GET /projects/{projectId}/package`。Viewer SDK 用不带自定义请求头的 `fetch` 下载项目包，所以这个地址要能靠 Cookie 或签名访问。

## 14. 待确认的问题

| # | 问题 | 建议 | 为什么要定 |
| --- | --- | --- | --- |
| 1 | 用 Cookie 还是 Bearer Token？有没有统一登录（SSO）？ | 同域部署加 HttpOnly Cookie | `<img>` 显示封面和 WebSocket 连接都无法带自定义请求头。用 Token 的话，封面要改成签名地址，WebSocket 也要另想办法 |
| 2 | 项目、资源、组件、模板归属到个人还是团队？ | 归属到团队，团队内共享 | 决定列表的可见范围、去重范围和权限模型 |
| 3 | 多人同时编辑要做到什么程度？ | 第一版用版本号防覆盖，不做实时协作 | 实时协作要改数据模型，工作量差一个量级 |
| 4 | 后端要校验场景内容吗？ | 第一版只查第 7.2 节的基本项；以后要加校验，就只拒绝必需字段缺失，放行未知字段 | 严格校验会把前后端的发版绑在一起 |
| 5 | 模型被历史版本引用时能删吗？ | 软删除：从资源库隐藏，文件保留到没有任何引用时再清理 | 硬删除后，恢复旧版本会缺模型。现在的前端只检查当前场景的引用，这一点在对接时需要补上 |
| 6 | 数据接口的认证放在哪？ | 第一版只用同域 Cookie。需要跨系统取数时，再由后端做代理，Token 只存在服务器 | 现在 Token 存在每个人的浏览器里，换电脑就没了。WebSocket 跨域认证目前没有方案，如果确实需要，要增加一次性票据接口，前端也要改 |
| 7 | 设备离线怎么表达？ | 约定 `online` 或 `status` 变量，由后端如实推送 | 否则离线设备会一直显示最后的数值 |
| 8 | 新建场景的默认数据地址是什么？ | 由部署配置提供，不写死在代码里 | 现在默认是本机模拟器 `ws://127.0.0.1:8787/realtime`，上线后不可用。WebSocket 地址又必须写完整，所以换环境时已有场景也要改 |
| 9 | 生产环境用 HTTPS 吗？ | 用 HTTPS，内网也一样 | 前端用到的 `crypto.randomUUID` 和 `crypto.subtle` 只在 HTTPS 或 localhost 下可用，纯 HTTP 的内网地址上新建对象和导出项目包都会报错 |
| 10 | 模型文件存在哪？ | 对象存储，通过预签名地址下载 | 决定第 8.4 节用 302 还是直接返回，以及要不要配置跨域 |
| 11 | 项目被大屏引用时能删吗？ | 允许删除，大屏显示“场景不存在” | 大屏文档保存了 `sceneProjectId`，这份文档不涉及大屏接口，但删除行为要和大屏一起定 |

## 15. 前端对接要做的改动

Viewer SDK 从项目包加载，不依赖这些接口，对外 API 不变。

| 模块 | 改动 |
| --- | --- |
| 登录 | 登录页接真实接口，路由加登录检查。编辑中登录过期时不能直接跳走，否则未保存的修改会丢 |
| 项目 store | 现在是同步读写 localStorage，要改成异步。卡片从 `cover` 改用 `coverUrl`。项目 ID 改由后端生成 |
| 场景保存 | `SceneRepository` 增加 `revision` 和 `saveId`；保存改成串行；增加冲突提示 |
| 模型 | 实现基于接口的 `AssetRepository`；限制并发；加超时和下载进度。缩略图缓存的键改成 `sha256`，并且先查缓存再下载，否则打开资源页会把所有模型都下载一遍 |
| 版本、组件、模板 | 这三个仓库还是具体实现，要抽出接口再替换 |
| 封面 | 限制上传频率，改为上传二进制 |
| 项目包 | 导入时不再自己生成资源 ID，改用接口返回的 ID 替换场景里的引用 |

## 附录 A：场景文档示例

最小可用的场景，包含一个模型节点和一个设备绑定，已用前端的校验逻辑验证通过。字段的完整定义见 [JSON Schema](schema/scene-document.v2.schema.json)。

后端主要关心这几个字段：`version`、`projectId`，以及用于统计引用的 `nodes[].model.assetId` 和 `settings.sky`。

```json
{
  "version": 2,
  "projectId": "p_demo",
  "metadata": {
    "name": "示例项目",
    "updatedAt": "2026-11-04T08:30:00.000Z"
  },
  "dataSources": [
    {
      "id": "realtime",
      "name": "实时设备数据",
      "type": "websocket",
      "enabled": true,
      "url": "wss://park.example.com/realtime"
    }
  ],
  "settings": {
    "helpers": {
      "grid": true,
      "axes": false
    },
    "ground": {
      "enabled": true,
      "size": 600,
      "color": "#3a3f44"
    },
    "sky": {
      "mode": "physical",
      "color": "#20242a",
      "hdrAssetId": null,
      "environmentIntensity": 0.7
    },
    "time": {
      "hour": 15,
      "azimuth": 30
    },
    "lighting": {
      "ambientIntensity": 0.6,
      "sunIntensity": 2.4,
      "shadows": true
    },
    "fog": {
      "enabled": true,
      "density": 0.3
    },
    "post": {
      "exposure": 1,
      "bloom": {
        "enabled": true,
        "intensity": 0.7,
        "threshold": 1
      },
      "vignette": true,
      "contrast": 0.06,
      "saturation": 0.05
    },
    "weather": {
      "kind": "none",
      "intensity": 0.6
    }
  },
  "nodes": [
    {
      "id": "node_1",
      "parentId": null,
      "name": "1 号储能柜",
      "kind": "model",
      "visible": true,
      "locked": false,
      "transform": {
        "position": [
          0,
          0,
          0
        ],
        "rotation": [
          0,
          0,
          0
        ],
        "scale": [
          1,
          1,
          1
        ]
      },
      "model": {
        "assetId": "asset_01",
        "overrides": {},
        "deleted": []
      }
    }
  ],
  "bindings": [
    {
      "id": "binding_1",
      "target": {
        "type": "node",
        "nodeId": "node_1"
      },
      "device": {
        "id": "ESS-001",
        "name": "1 号储能柜",
        "type": "energy-storage"
      },
      "variables": [
        {
          "id": "var_soc",
          "key": "soc",
          "name": "荷电状态",
          "dataType": "number",
          "unit": "%"
        },
        {
          "id": "var_alarm",
          "key": "alarm",
          "name": "告警",
          "dataType": "boolean"
        },
        {
          "id": "var_status",
          "key": "status",
          "name": "状态",
          "dataType": "string"
        }
      ]
    }
  ],
  "effects": [],
  "visualRules": [],
  "interactions": [],
  "bookmarks": [],
  "tours": [],
  "presentation": {
    "autoplayTourId": null,
    "idleSeconds": 0,
    "autoRotate": false
  }
}
```
