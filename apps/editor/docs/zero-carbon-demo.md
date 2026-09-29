# 零碳智慧园区 Demo

在“项目管理”点击“创建园区示例”，即可生成一份全新的独立副本。该操作不会覆盖已经编辑过的示例，再次点击即可重建。

## 演示顺序

1. 从项目卡片进入编辑器，查看园区布局、8 个储能柜的设备绑定、变量、可视化规则和交互配置。
2. 返回项目管理，进入该项目的“数据大屏”。左侧展示全场实时汇总，右侧展示设备列表。
3. 单击 3D 储能柜查看实时数据；悬停查看临时高亮；双击聚焦。
4. 点击右侧任意设备，由 Dashboard 通过 Viewer Contract 完成选中和聚焦。
5. 等待 Mock 数据变化，观察温度预警、严重告警特效以及全场指标同步变化。
6. 单击储能柜后，左侧会显示 `open-device-detail` 场景业务事件，证明 Interaction 配置能够通知宿主页面。

示例完全由普通 `SceneDocumentV1` 配置组成，运行时仍使用现有 MockDataSource、EffectRuntime、VisualRuleRuntime 和 InteractionRuntime，没有专用 Demo Runtime。
