<script setup lang="ts">
/**
 * 已登录后的应用外壳：侧边栏 + 顶部栏 + 内容区。
 *
 * 响应式策略：
 *  - ≥900px：侧边栏常驻，可在 240px / 72px 间折叠；
 *  - <900px：侧边栏改为覆盖式抽屉，默认隐藏，由顶部按钮唤出，
 *    选择菜单后自动关闭，避免窄屏下遮挡内容。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CollectionTag,
  Connection,
  DataAnalysis,
  Document,
  Grid,
  TrendCharts,
} from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
import { useDictionaryStore } from '@/stores/dictionary'
import { useSystemStore } from '@/stores/system'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const system = useSystemStore()
const dictionary = useDictionaryStore()

/** 宽屏折叠态（图标栏）。 */
const collapsed = ref(false)
/** 窄屏抽屉是否打开。 */
const drawerOpen = ref(false)
/** 当前是否为窄屏。 */
const isNarrow = ref(false)

const NAV_ITEMS = [
  { name: 'dashboard', label: '概览', icon: Grid },
  { name: 'transactions', label: '流水', icon: Document },
  { name: 'external', label: '往来', icon: Connection },
  { name: 'analytics', label: '分析', icon: TrendCharts },
  { name: 'settings', label: '分类与标签', icon: CollectionTag },
  { name: 'data-quality', label: '数据检查', icon: DataAnalysis },
] as const

const currentTitle = computed(() => (route.meta.title as string | undefined) ?? '')

const copyright = 'Copyright ©️ 2026 Narrastory'

const lastEditText = computed(() => {
  if (!system.lastEditTime) return '--'
  const date = new Date(system.lastEditTime)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { hour12: false })
})

let mediaQuery: MediaQueryList | null = null

function syncNarrow(event: MediaQueryList | MediaQueryListEvent): void {
  isNarrow.value = event.matches
  if (!event.matches) drawerOpen.value = false
}

onMounted(async () => {
  mediaQuery = window.matchMedia('(max-width: 899px)')
  syncNarrow(mediaQuery)
  mediaQuery.addEventListener('change', syncNarrow)

  // 登录后初始化：状态 + 四组字典并行加载。
  // 失败不阻塞界面，页面各自有错误状态。
  try {
    await system.fetchStatus()
  } catch {
    // 401 已由全局处理器接管；其它错误在页面内展示。
  }
  try {
    await dictionary.loadAll()
  } catch {
    // 忽略：字典不可用时表单会自行提示。
  }
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', syncNarrow)
})

// 内容区尺寸变化后图表需要重新计算，这里用路由切换通知一次。
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
  },
)

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('退出后需要重新登录，确定退出吗？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  await auth.logout()
  ElMessage.success('已退出登录')
  await router.replace({ name: 'login' })
}

function go(name: string): void {
  void router.push({ name })
}
</script>

<template>
  <div class="layout" :class="{ 'layout--collapsed': collapsed && !isNarrow }">
    <!-- 窄屏下点击遮罩关闭抽屉 -->
    <div
      v-if="isNarrow && drawerOpen"
      class="layout__overlay"
      aria-hidden="true"
      @click="drawerOpen = false"
    ></div>

    <aside class="sidebar" :class="{ 'sidebar--open': drawerOpen }" aria-label="主导航">
      <div class="sidebar__brand">
        <img src="/icon-512.png" alt="" width="32" height="32" class="sidebar__logo" />
        <span v-if="!collapsed || isNarrow" class="sidebar__name">NBill</span>
        <span v-if="!collapsed || isNarrow" class="sidebar__version">v3.1</span>
      </div>

      <nav class="sidebar__nav">
        <button
          v-for="item in NAV_ITEMS"
          :key="item.name"
          type="button"
          class="sidebar__item"
          :class="{ 'is-active': route.name === item.name }"
          :title="collapsed && !isNarrow ? item.label : undefined"
          :aria-label="collapsed && !isNarrow ? item.label : undefined"
          @click="go(item.name)"
        >
          <el-icon class="sidebar__icon" aria-hidden="true"><component :is="item.icon" /></el-icon>
          <span class="sidebar__label">{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar__footer">
        <span v-if="!collapsed || isNarrow" class="sidebar__copyright">{{ copyright }}</span>
      </div>
    </aside>

    <div class="layout__main">
      <header class="topbar">
        <button
          type="button"
          class="topbar__toggle"
          :aria-label="isNarrow ? '打开菜单' : collapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="isNarrow ? (drawerOpen = !drawerOpen) : (collapsed = !collapsed)"
        >
          <span class="topbar__toggle-bars" aria-hidden="true"></span>
        </button>

        <span class="topbar__context">{{ currentTitle }}</span>

        <div class="topbar__meta">
          <span class="topbar__meta-item">
            <span class="topbar__meta-label">最近保存</span>
            <span class="tabular">{{ lastEditText }}</span>
          </span>
          <span class="topbar__user">
            <span class="topbar__avatar">
              <img src="@/assets/images/avatar.jpg" alt="" />
            </span>
            {{ auth.username ?? '用户' }}
          </span>
          <el-button size="small" @click="handleLogout">退出</el-button>
        </div>
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 15rem 1fr;
  min-height: 100dvh;
  transition: grid-template-columns var(--duration-base) var(--ease-out-soft);
}

.layout--collapsed {
  grid-template-columns: 4.5rem 1fr;
}

/* ---------------------------------- 侧栏 ---------------------------------- */

/**
 * 侧边栏：绿色渐变 + 钞票防伪网纹。
 *
 * 纹理是内联 SVG（相位错开的波浪线 + 极淡货币符号），用 data URI 而非图片文件：
 * 无需额外请求，也随主题一起进版本库。
 *
 * 为什么是波浪线而不是 K 线柱：矩形柱体是**可辨识的物体**，一旦能被看清就会
 * 读成壁纸，而且和导航文字抢注意力。纸币与票据上的雕刻底纹（guilloche）
 * 本身就是「钱 / 有价证券」的视觉语汇，且是纯抽象线条 —— 它的职责只是让
 * 大片纯色有质感，**一旦能看清就俗了**。
 *
 * 拼接无缝的原因：每条波浪的周期都等于平铺宽度 240px。以第一条为例，
 * 平铺单元右边缘的入射切线由控制点 (180,48) → (240,20) 决定，方向 (60,-28)；
 * 下一单元左边缘的出射切线由 (0,20) → (60,-8) 决定，方向同样是 (60,-28)。
 * 两者相等，故左右相接处既连续又光滑。路径因此画到 -240…480，给相位平移留余量。
 */
.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  padding: 1rem 0.75rem;
  overflow: hidden;
  color: #ffffff;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='1'%3E%3Cpath d='M-240 20 Q-180 -8 -120 20 Q-60 48 0 20 Q60 -8 120 20 Q180 48 240 20 Q300 -8 360 20 Q420 48 480 20'/%3E%3Cg transform='translate(120 0)'%3E%3Cpath d='M-240 60 Q-180 40 -120 60 Q-60 80 0 60 Q60 40 120 60 Q180 80 240 60 Q300 40 360 60 Q420 80 480 60'/%3E%3C/g%3E%3Cg transform='translate(60 0)'%3E%3Cpath d='M-240 100 Q-180 68 -120 100 Q-60 132 0 100 Q60 68 120 100 Q180 132 240 100 Q300 68 360 100 Q420 132 480 100'/%3E%3C/g%3E%3Cg transform='translate(180 0)'%3E%3Cpath d='M-240 140 Q-180 118 -120 140 Q-60 162 0 140 Q60 118 120 140 Q180 162 240 140 Q300 118 360 140 Q420 162 480 140'/%3E%3C/g%3E%3Cg transform='translate(30 0)'%3E%3Cpath d='M-240 180 Q-180 150 -120 180 Q-60 210 0 180 Q60 150 120 180 Q180 210 240 180 Q300 150 360 180 Q420 210 480 180'/%3E%3C/g%3E%3Cg transform='translate(150 0)'%3E%3Cpath d='M-240 220 Q-180 202 -120 220 Q-60 238 0 220 Q60 202 120 220 Q180 238 240 220 Q300 202 360 220 Q420 238 480 220'/%3E%3C/g%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.04' font-family='monospace' font-size='16'%3E%3Ctext x='32' y='48'%3E%C2%A5%3C/text%3E%3Ctext x='158' y='82'%3E$%3C/text%3E%3Ctext x='96' y='207'%3E%E2%82%BF%3C/text%3E%3C/g%3E%3C/svg%3E"),
    linear-gradient(180deg, var(--color-brand-800) 0%, var(--color-brand-950) 100%);
  background-repeat: repeat, no-repeat;
  background-size: 240px 240px, auto;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.5rem 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.12);
}

.sidebar__logo {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
}

.sidebar__name {
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.sidebar__version {
  padding: 0.0625rem 0.375rem;
  font-size: 0.6875rem;
  color: rgb(255 255 255 / 0.75);
  background: rgb(255 255 255 / 0.14);
  border-radius: 0.25rem;
}

.sidebar__nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  overflow-y: auto;
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  font-size: 0.9375rem;
  color: rgb(255 255 255 / 0.82);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 0.5rem;
  transition:
    background-color var(--duration-fast) var(--ease-out-soft),
    color var(--duration-fast) var(--ease-out-soft);
}

.sidebar__item:hover {
  color: #ffffff;
  background-color: rgb(255 255 255 / 0.1);
}

/* 当前项用底色 + 左侧色条双重标识，不只依赖颜色 */
.sidebar__item.is-active {
  font-weight: 600;
  color: #ffffff;
  background-color: rgb(255 255 255 / 0.16);
  box-shadow: inset 3px 0 0 var(--color-brand-300);
}

.sidebar__label {
  overflow: hidden;
  white-space: nowrap;
}

.sidebar__icon {
  flex: 0 0 auto;
  width: 1.125rem;
  height: 1.125rem;
  font-size: 1.125rem;
}

.layout--collapsed .sidebar__item {
  justify-content: center;
  padding-inline: 0.5rem;
}

/* 折叠态只留稳定图标；完整名称通过 title / aria-label 提供。 */
.layout--collapsed .sidebar__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.sidebar__footer {
  padding: 0.75rem 0.5rem 0;
  border-top: 1px solid rgb(255 255 255 / 0.12);
}

.sidebar__copyright {
  font-size: 0.6875rem;
  line-height: 1.4;
  color: rgb(255 255 255 / 0.62);
}

/* --------------------------------- 主区域 --------------------------------- */

.layout__main {
  display: flex;
  flex-direction: column;
  min-width: 0; /* 允许内部表格/图表收缩，避免撑破栅格 */
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem);
  background: rgb(255 255 255 / 0.86);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--nb-border);
}

.topbar__toggle {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  flex: 0 0 2.75rem;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--nb-border);
  border-radius: 0.5rem;
}

.topbar__toggle:hover {
  background-color: var(--color-brand-50);
  border-color: var(--color-brand-300);
}

/* 纯 CSS 汉堡图标 */
.topbar__toggle-bars,
.topbar__toggle-bars::before,
.topbar__toggle-bars::after {
  display: block;
  width: 1rem;
  height: 2px;
  background-color: var(--nb-text);
  border-radius: 1px;
  transition: transform var(--duration-fast) var(--ease-out-soft);
}

.topbar__toggle-bars::before,
.topbar__toggle-bars::after {
  content: '';
  position: relative;
}

.topbar__toggle-bars::before {
  top: -5px;
}

.topbar__toggle-bars::after {
  top: 3px;
}

.topbar__context {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--nb-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar__meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.topbar__meta-item {
  display: flex;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.topbar__meta-label {
  color: var(--nb-text-subtle);
}

.topbar__user {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.875rem;
  font-weight: 500;
}

/**
 * 圆形头像框。
 *
 * 原图整幅放进圆里，保留半身像的完整构图（头发、脸、脖子、肩膀都在）。
 * 原图 1196×1120 接近正方形，`cover` 只会裁掉左右各约 1px，等于原样展示。
 *
 * 不做放大取景：那样会把脖子和肩膀裁掉，而它们是要保留的。
 *
 * 纯装饰：紧挨着的用户名已经说明了身份，因此不设 alt、不进无障碍树，
 * 也不做点击态 —— 退出仍由右侧的按钮承担。
 */
.topbar__avatar {
  display: block;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  overflow: hidden;
  background-color: var(--color-brand-100);
  border: 1px solid var(--nb-border);
  border-radius: 50%;
}

.topbar__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.content {
  flex: 1;
  width: 100%;
  max-width: var(--nb-content-max);
  min-width: 0;
  padding: var(--nb-space-page);
  margin-inline: auto;
}

/* ------------------------------- 窄屏适配 -------------------------------- */

@media (max-width: 899px) {
  .layout,
  .layout--collapsed {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 30;
    width: 15rem;
    transform: translateX(-100%);
    transition: transform var(--duration-base) var(--ease-out-soft);
  }

  .sidebar--open {
    transform: translateX(0);
  }

  .layout__overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgb(15 23 42 / 0.45);
  }

  /* 窄屏下时间信息让位给标题与操作 */
  .topbar__meta-item {
    display: none;
  }
}

@media (max-width: 480px) {
  .topbar__user {
    display: none;
  }
}
</style>
