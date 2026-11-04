<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Copy, ExternalLink, Rocket } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useScreenSession } from './session'

const session = useScreenSession()
const router = useRouter()
const visible = computed({
  get: () => session.ui.publishing,
  set: value => (session.ui.publishing = value),
})
const note = ref('')
const busy = ref(false)
const done = ref(false)
const link = computed(
  () =>
    new URL(
      router.resolve({ name: 'screen-play', params: { screenId: session.doc.value.id } }).href,
      window.location.href,
    ).href,
)
const publishedAt = computed(() =>
  session.published.value
    ? new Date(session.published.value.at).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)

watch(visible, open => {
  if (!open) return
  note.value = ''
  done.value = false
})

async function publish(): Promise<void> {
  busy.value = true
  try {
    await session.publish(note.value)
    done.value = true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发布失败')
  } finally {
    busy.value = false
  }
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(link.value)
    ElMessage.success('放映链接已复制')
  } catch {
    ElMessage.info(link.value)
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="发布大屏" width="520px" append-to-body class="studio-dialog">
    <div class="publish" data-testid="publish-dialog">
      <template v-if="!done">
        <p>发布后，放映链接显示这一刻的大屏；之后的修改只保存为草稿，不影响正在放映的大屏，直到再次发布。</p>
        <p v-if="session.published.value" class="s-hint">
          上次发布：{{ publishedAt }}{{ session.unpublished ? '，之后有修改未发布' : '，之后没有修改' }}
        </p>
        <label>版本说明</label>
        <textarea
          v-model="note"
          class="s-textarea"
          rows="3"
          placeholder="例如：新增建筑能耗排行，调整告警列表位置（可不填）"
          data-testid="publish-note"
        />
      </template>
      <template v-else>
        <p class="done"><Rocket :size="16" />已发布。大屏、电视或拼接屏打开下面的链接即可放映：</p>
        <div class="link">
          <input class="s-input s-mono" :value="link" readonly data-testid="publish-link" />
          <button class="s-btn" @click="copyLink"><Copy :size="13" />复制</button>
          <a class="s-btn" :href="link" target="_blank"><ExternalLink :size="13" />打开</a>
        </div>
        <p class="s-hint">放映页随发布自动刷新；接口数据与实时数据照常更新。</p>
      </template>
    </div>
    <template #footer>
      <template v-if="!done">
        <button class="s-btn" @click="visible = false">取消</button>
        <button class="s-btn s-btn--primary" :disabled="busy" data-testid="publish-confirm" @click="publish">
          <Rocket :size="13" />{{ busy ? '发布中…' : '发布' }}
        </button>
      </template>
      <button v-else class="s-btn s-btn--primary" @click="visible = false">完成</button>
    </template>
  </el-dialog>
</template>

<style scoped>
.publish {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--s-fg-2);
  line-height: 1.65;
}
.publish p {
  margin: 0;
}
.publish label {
  color: var(--s-fg);
  font-size: 12px;
}
.done {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--s-ok);
}
.link {
  display: flex;
  gap: 6px;
}
.link a {
  text-decoration: none;
}
</style>
