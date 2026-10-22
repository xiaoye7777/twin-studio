import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          redirect: '/projects',
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/project/ProjectManagement.vue'),
          meta: { title: '项目管理' },
        },
        {
          path: 'screens',
          name: 'screens',
          component: () => import('@/views/screen/ScreenList.vue'),
          meta: { title: '数据大屏' },
        },
        {
          path: 'assets',
          name: 'assets',
          component: () => import('@/views/asset/AssetManagement.vue'),
          meta: { title: '资产管理' },
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/Login.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/editor/:projectId',
      name: 'editor',
      component: () => import('@/views/editor/SceneEditor.vue'),
      meta: { title: '场景编辑器' },
    },
    {
      path: '/screens/:screenId/edit',
      name: 'screen-editor',
      component: () => import('@/views/screen/ScreenEditor.vue'),
      meta: { title: '大屏编辑器' },
    },
    {
      path: '/screens/:screenId/preview',
      name: 'screen-preview',
      component: () => import('@/views/screen/ScreenPreview.vue'),
      meta: { title: '大屏预览' },
    },
    {
      path: '/projects/:projectId/dashboard',
      name: 'project-dashboard',
      component: () => import('@/views/dashboard/ProjectDashboard.vue'),
      meta: { title: '数据大屏' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/projects',
    },
  ],
})

router.afterEach(to => {
  document.title = `${String(to.meta.title ?? 'Digital Twin Studio')} · Digital Twin Studio`
})

export default router
