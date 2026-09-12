/**
 * 路由表与鉴权守卫。
 *
 * 采用 hash 模式：部署到任意静态路径都不需要后端配 SPA fallback。
 * 守卫用"返回值"而不是 `next()` —— Vue Router 5 已弃用 `next()`。
 *
 * 会话可用性判断：仅有 token 不够（后端重启会让旧 token 失效），
 * 因此首次进入受保护路由时用 /status 校验一次，失败即回到登录页。
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '概览', icon: 'dashboard' },
      },
      {
        path: 'transactions',
        name: 'transactions',
        component: () => import('@/views/TransactionsView.vue'),
        meta: { title: '流水', icon: 'transactions' },
      },
      {
        path: 'external',
        name: 'external',
        component: () => import('@/views/ExternalView.vue'),
        meta: { title: '往来', icon: 'external' },
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/views/AnalyticsView.vue'),
        meta: { title: '分析', icon: 'analytics' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '分类与标签', icon: 'settings' },
      },
      {
        path: 'data-quality',
        name: 'data-quality',
        component: () => import('@/views/DataQualityView.vue'),
        meta: { title: '数据检查', icon: 'quality' },
      },
    ],
  },
  {
    // 兜底：未匹配的路径回首页，由守卫决定是否需要登录。
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const isPublic = to.meta.public === true

  if (isPublic) {
    // 已登录用户不应再看到登录页。
    if (to.name === 'login' && auth.isAuthenticated && auth.sessionVerified) {
      return { name: 'dashboard' }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 每个会话只校验一次，避免每次路由切换都打一次 /status。
  if (!auth.sessionVerified) {
    const ok = await auth.verifySession()
    if (!ok) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  return true
})

router.afterEach((to) => {
  const base = import.meta.env.VITE_APP_TITLE || 'NBill'
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · ${base}` : base
})
