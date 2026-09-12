/**
 * 冬季雪花效果的开关与参数。
 *
 * 生效区间：每年 11 月 7 日 ~ 次年 2 月 4 日（含首尾两天）。
 *
 * 由于该区间之外（例如 9 月）无法看到效果，额外支持 URL 覆盖用于验收：
 *   ?snow=1  强制开启     ?snow=0  强制关闭
 * 覆盖只在开发与预览环境生效，不影响生产行为。
 */

import { computed, onMounted, onUnmounted, ref } from 'vue'

import { prefersReducedMotion } from '@/utils/chart'

/** 雪花季起始：11 月 7 日。 */
const SEASON_START = { month: 11, day: 7 }
/** 雪花季结束：次年 2 月 4 日。 */
const SEASON_END = { month: 2, day: 4 }

/**
 * 判断给定日期是否处于雪花季（含边界）。
 * 区间跨年，因此不能用简单的月份区间比较。
 */
export function isSnowSeason(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()

  // 11/7 ~ 12/31
  if (month === SEASON_START.month) return day >= SEASON_START.day
  // 1/1 ~ 1/31
  if (month === 1) return true
  // 2/1 ~ 2/4
  if (month === SEASON_END.month) return day <= SEASON_END.day
  // 12 月整月
  if (month === 12) return true

  return false
}

/** 读取 URL 覆盖参数；非 0/1 视为未设置。 */
function readOverride(): boolean | null {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return null
  const value = new URLSearchParams(window.location.search).get('snow')
  if (value === '1') return true
  if (value === '0') return false
  return null
}

export interface SnowfallOptions {
  /** 基础粒子数量（桌面端）。移动端会按比例减少。 */
  count?: number
}

export function useSnowfall(options: SnowfallOptions = {}) {
  const { count = 48 } = options

  const reducedMotion = ref(false)

  const update = () => {
    reducedMotion.value = prefersReducedMotion()
  }

  onMounted(() => {
    update()
    // 用户可能在运行中修改系统偏好。
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', update)
  })

  onUnmounted(() => {
    window.matchMedia?.('(prefers-reduced-motion: reduce)').removeEventListener('change', update)
  })

  /** 当前是否处于雪花季（或已被 URL 覆盖）。 */
  const inSeason = computed(() => {
    const override = readOverride()
    return override === null ? isSnowSeason() : override
  })

  /**
   * 实际粒子数：尊重 reduced-motion（关闭），
   * 窄屏减少约一半以控制性能开销。
   */
  const particleCount = computed(() => {
    if (!inSeason.value) return 0
    if (reducedMotion.value) return 0
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768
    return isNarrow ? Math.round(count / 2) : count
  })

  /** 是否渲染雪花层。 */
  const enabled = computed(() => inSeason.value && particleCount.value > 0)

  return { inSeason, enabled, particleCount, reducedMotion }
}
