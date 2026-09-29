<script setup lang="ts">
import { TwinSceneViewer } from '@twin-studio/viewer'
import { useTwinDashboard } from './useTwinDashboard'
const twin = useTwinDashboard()
const viewerRef = twin.viewerRef
const packageSource = new URLSearchParams(location.search).get('package') || '/project-websocket.twin.zip'
const value = (key:string) => twin.selected.value?.values[key]
const fixed = (input:number|null, digits=1) => input === null ? '—' : input.toFixed(digits)
const liveLabels: Record<string,string> = { unconfigured:'未配置实时数据源', connecting:'实时数据连接中', connected:'WebSocket 已连接',
  disconnected:'实时数据未连接', error:'实时数据连接错误' }
const number = (key:string, digits=1) => typeof value(key) === 'number' ? (value(key) as number).toFixed(digits) : '—'
function handleError(message:string) { twin.loadStatus.value = message }
</script>

<template>
  <main class="screen" data-testid="dashboard-demo" :data-selected-device-id="twin.selectedDeviceId.value ?? ''">
    <TwinSceneViewer ref="viewerRef" :source="packageSource" @loaded="twin.handleLoaded"
      @selection-change="twin.handleSelection" @interaction-event="twin.handleInteraction"
      @error="handleError" />
    <header class="topbar panel">
      <div><p class="eyebrow">ZERO CARBON DIGITAL TWIN</p><h1>零碳智慧园区数字孪生监控</h1></div>
      <div class="live" data-testid="live-status" :data-status="twin.connection.value.status" :class="{offline:twin.connection.value.status!=='connected'}" :title="twin.connection.value.error ?? '由项目配置决定的数据源'">
        <i/>{{ liveLabels[twin.connection.value.status] ?? twin.connection.value.status }}
        <small data-testid="source-message-count">{{ twin.connection.value.messages }}</small>
      </div>
      <p v-if="twin.connection.value.error" class="source-error" data-testid="source-error">
        {{ twin.connection.value.error }}
      </p>
      <p class="load-status">{{ twin.loadStatus.value }}</p>
      <time>{{ new Date().toLocaleDateString('zh-CN') }}</time>
    </header>

    <div v-if="twin.connection.value.status !== 'connected'" class="no-live" data-testid="no-live-banner">
      无实时数据 · {{ liveLabels[twin.connection.value.status] ?? twin.connection.value.status }}<small v-if="twin.connection.value.error">{{ twin.connection.value.error }}</small>
    </div>
    <aside class="left panel">
      <div class="section-title"><span>园区运行概览</span><small>OVERVIEW</small></div>
      <div class="kpis">
        <article><small>设备总数</small><strong data-testid="kpi-total">{{ twin.summary.value.total }}</strong><em>台</em></article>
        <article><small>在线设备</small><strong class="green">{{ twin.summary.value.online }}</strong><em>台</em></article>
        <article><small>当前告警</small><strong class="alarm">{{ twin.summary.value.alarms }}</strong><em>项</em></article>
        <article><small>总功率</small><strong class="cyan">{{ fixed(twin.summary.value.power) }}</strong><em>kW</em></article>
      </div>
      <div class="metric"><span>平均 SOC</span><b>{{ fixed(twin.summary.value.soc) }}%</b><div><i :style="{width:`${twin.summary.value.soc ?? 0}%`}"/></div></div>
      <div class="metric temperature"><span>平均温度</span><b>{{ fixed(twin.summary.value.temperature) }}℃</b><div><i :style="{width:`${Math.min(100,twin.summary.value.temperature ?? 0)}%`}"/></div></div>
      <div v-if="twin.lastEvent.value" class="event" data-testid="last-interaction-event"><small>最近业务事件</small><b>{{ twin.lastEvent.value.eventName }}</b><span>{{ twin.lastEvent.value.deviceId ?? '场景对象' }}</span></div>
      <div v-else class="event muted"><small>最近业务事件</small><span>等待场景交互…</span></div>
    </aside>

    <aside class="right panel">
      <div class="section-title"><span>{{ twin.selected.value ? '当前设备' : '全场上下文' }}</span><small>DEVICE</small></div>
      <template v-if="twin.selected.value">
        <div class="device-head"><div class="device-icon">ESS</div><div><h2>{{ twin.selected.value.name }}</h2><p>{{ twin.selected.value.id }}</p></div><span :class="['badge',twin.selected.value.alarm?'danger':'ok']">{{ twin.selected.value.alarm?'告警':'正常' }}</span></div>
        <dl class="values">
          <div><dt>SOC</dt><dd class="green">{{ number('soc') }} <small>%</small></dd></div>
          <div><dt>温度</dt><dd>{{ number('temperature') }} <small>℃</small></dd></div>
          <div><dt>实时功率</dt><dd class="cyan">{{ number('power') }} <small>kW</small></dd></div>
          <div><dt>运行状态</dt><dd>{{ value('status') ?? '—' }}</dd></div>
        </dl>
        <button class="ghost" @click="twin.clearSelection">返回园区总览</button>
      </template>
      <div v-else class="empty"><div class="radar"/><h2>园区总览模式</h2><p>单击 3D 储能柜查看实时数据<br/>双击设备聚焦 · 悬停高亮</p></div>
    </aside>

    <section class="fleet panel">
      <div class="fleet-title"><span>储能设备</span><small>点击设备可在三维场景中选中并聚焦</small></div>
      <div class="fleet-list">
        <button v-for="device in twin.devices.value" :key="device.id" :data-testid="`device-${device.id}`" :class="{selected:device.id===twin.selectedDeviceId.value}" @click="twin.chooseDevice(device.id)">
          <i :class="device.alarm?'alarm-dot':'online-dot'"/><span><b>{{ device.name }}</b><small>{{ device.id }}</small></span><em>{{ typeof device.values.soc==='number' ? `${device.values.soc.toFixed(0)}%` : '—' }}</em>
        </button>
      </div>
    </section>
  </main>
</template>
