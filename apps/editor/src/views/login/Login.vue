<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Lock, User } from '@element-plus/icons-vue'
import { Boxes, MonitorPlay, Radio } from 'lucide-vue-next'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import '@/studio/studio.css'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: 'demo', password: 'demo123' })

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const features = [
  { icon: Boxes, title: '低代码搭建', text: '拖入模型、绘制能流与分区，配置告警、特效和导览' },
  { icon: Radio, title: '实时数据驱动', text: '设备数据通过 WebSocket 驱动标牌、告警和部件运动' },
  { icon: MonitorPlay, title: '一键交付大屏', text: '导出项目包，数据大屏通过 Viewer SDK 加载并双向联动' },
]

async function login() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  window.setTimeout(() => {
    ElMessage.success('登录成功')
    loading.value = false
    router.push('/projects')
  }, 450)
}
</script>

<template>
  <main class="studio-home login">
    <section class="login__hero" aria-hidden="false">
      <div class="login__grid" />
      <div class="login__glow" />
      <div class="login__brand">
        <span class="login__mark">T</span>
        <span><strong>Twin Studio</strong><small>零碳园区数字孪生平台</small></span>
      </div>
      <div class="login__pitch">
        <h1>把园区搬进屏幕<br />让能耗与碳排一目了然</h1>
        <ul>
          <li v-for="item in features" :key="item.title">
            <span class="login__icon"><component :is="item.icon" :size="16" /></span>
            <span
              ><strong>{{ item.title }}</strong
              >{{ item.text }}</span
            >
          </li>
        </ul>
      </div>
    </section>

    <section class="login__panel">
      <div class="login__card">
        <h2>登录工作台</h2>
        <p class="login__sub">使用账号进入项目与编辑器</p>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="login">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" size="large" placeholder="请输入用户名" :prefix-icon="User" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              size="large"
              type="password"
              placeholder="请输入密码"
              show-password
              :prefix-icon="Lock"
              @keyup.enter="login"
            />
          </el-form-item>
          <el-button class="login__submit" type="primary" size="large" :loading="loading" @click="login">
            登录
          </el-button>
        </el-form>
        <p class="login__note">演示环境 · 任意用户名和密码均可登录</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.2fr) minmax(380px, 1fr);
  background: var(--s-bg);
  color: var(--s-fg);
  font:
    13px/1.5 Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  color-scheme: dark;
}
.login__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 36px 48px;
  border-right: 1px solid var(--s-line);
  background: #121417;
}
.login__grid {
  position: absolute;
  inset: -40% -20% 0;
  background-image:
    linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 50% 70%, #000 20%, transparent 70%);
  transform: perspective(700px) rotateX(58deg);
  transform-origin: 50% 100%;
}
.login__glow {
  position: absolute;
  right: -10%;
  bottom: -20%;
  width: 70%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(232 137 74 / 0.22), transparent 65%);
  filter: blur(10px);
}
.login__brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}
.login__brand span:last-child {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.login__brand strong {
  font-size: 15px;
}
.login__brand small {
  color: var(--s-fg-3);
  font-size: 11px;
}
.login__mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: linear-gradient(135deg, #f2a66c, #d9703a);
  color: #1b130c;
  font-size: 17px;
  font-weight: 800;
}
.login__pitch {
  position: relative;
  max-width: 520px;
  padding-bottom: 24px;
}
.login__pitch h1 {
  margin: 0 0 28px;
  font-size: 32px;
  font-weight: 650;
  letter-spacing: 0.02em;
  line-height: 1.35;
}
.login__pitch ul {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.login__pitch li {
  display: flex;
  gap: 12px;
  color: var(--s-fg-2);
}
.login__pitch li strong {
  display: block;
  color: var(--s-fg);
  font-weight: 550;
}
.login__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--s-accent-line);
  border-radius: 8px;
  background: var(--s-accent-soft);
  color: var(--s-accent);
}
.login__panel {
  display: grid;
  place-items: center;
  padding: 32px;
}
.login__card {
  width: 100%;
  max-width: 360px;
}
.login__card h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}
.login__sub {
  margin: 6px 0 28px;
  color: var(--s-fg-3);
}
.login__submit {
  width: 100%;
  margin-top: 8px;
}
.login__note {
  margin: 22px 0 0;
  color: var(--s-fg-3);
  font-size: 12px;
  text-align: center;
}
@media (max-width: 860px) {
  .login {
    grid-template-columns: 1fr;
  }
  .login__hero {
    display: none;
  }
}
</style>
