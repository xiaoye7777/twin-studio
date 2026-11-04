import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import './theme/tokens.css'
import './style.css'
import { installTheme } from './theme/themes'
import * as twinCore from '@twin-studio/core'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
installTheme()
app.mount('#app')

// Browser QA scripts reach shared runtime modules (diagnostics counters) through the same instance the app uses.
if (import.meta.env.DEV) window.__twinCore = twinCore
