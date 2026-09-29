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
- 生成规则：数值随机游走（soc 20–95、温度 30–48、功率 80–250，其余 0–100）；第三台设备每 12 个周期中有 6 个周期温度升至 75℃ 并置 alarm/status，用于演示告警规则。
