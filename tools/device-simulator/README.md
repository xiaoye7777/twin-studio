# Device Simulator

演示与测试用的 WebSocket 设备模拟器，扮演真实 IoT 数据网关。协议与生产网关一致，因此大屏上的每一个数值都来自真实的 WebSocket 连接；接入真实设备时只需在编辑器中把数据源地址换成真实网关。

```bash
pnpm simulator                                             # 零碳园区 8 台储能柜（ESS-001 … ESS-008）
pnpm simulator -- --package ./exported/project.twin.zip    # 按项目包中的设备绑定与变量生成数据
pnpm simulator -- --port 8787 --host 0.0.0.0 --interval 500
```

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--package` | 无 | 读取 `.twin.zip` 的 `scene.json`，为每个绑定设备的每个变量生成数据 |
| `--port` | `TWIN_DATA_PORT` 或 8787 | 监听端口 |
| `--host` | `TWIN_DATA_HOST` 或 127.0.0.1 | 局域网演示时用 `0.0.0.0`，项目中的地址改为本机 IP |
| `--interval` | 1000 | 推送间隔（毫秒） |

- WebSocket：`ws://<host>:<port>/realtime`，每个周期推送一个数组 `[{ "deviceId": "ESS-001", "soc": 72, ... }]`。
- `GET /status`：`{ connections, tick, profile, devices }`，测试用它确认连接数。
- 生成规则：数值随机游走（按变量名选择合理范围：SOC、温度、功率、风速、辐照度、电压、电流、湿度、PM2.5、CO₂、人数等；电量、碳排放为递增累计值）；第三台设备每 12 个周期中有 6 个周期温度升至 75℃ 并置 alarm/status，用于演示告警规则。
- **按项目订阅**：编辑器和 Viewer SDK（0.4.0+）连接后会发送 `{"type":"subscribe","devices":[{"deviceId":"ESS-001","variables":[{"key":"soc","dataType":"number"}]}]}`，模拟器随即只为该连接生成这些设备的数据。因此任何项目都能直接获得演示数据，无需先导出项目包；未发送订阅的客户端仍收到默认的零碳园区数据。真实网关可以忽略这条消息。
