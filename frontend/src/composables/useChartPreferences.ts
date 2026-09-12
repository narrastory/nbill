/**
 * 图表的两个可切换偏好：坐标轴类型（线性/对数）与时间显示范围。
 *
 *  - 坐标轴选择记入 sessionStorage，同一次会话内切换页面后保持；
 *  - 时间范围只影响 dataZoom 的显示窗口，**不触发接口请求** ——
 *    数据已经全部在手，这是纯前端操作。
 */

import { computed, ref, watch } from 'vue'

/** 普通 / 对数坐标轴。 */
export function useLogScale(key: string) {
  const storageKey = `nbill_log_${key}`

  const initial = (() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(storageKey) === '1'
  })()

  const logScale = ref(initial)

  watch(logScale, (value) => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(storageKey, value ? '1' : '0')
  })

  return {
    logScale,
    /** 分段控件的绑定值：'linear' | 'log' */
    axisMode: computed({
      get: () => (logScale.value ? 'log' : 'linear'),
      set: (value: string) => {
        logScale.value = value === 'log'
      },
    }),
  }
}

export type ZoomPreset = '3m' | '1y' | '3y' | 'all'

export const ZOOM_PRESETS: Array<{ value: ZoomPreset; label: string }> = [
  { value: '3m', label: '近 3 月' },
  { value: '1y', label: '近 1 年' },
  { value: '3y', label: '近 3 年' },
  { value: 'all', label: '全部' },
]

/** 支持 `YYYY` / `YYYY-MM` / `YYYY-MM-DD` 三种类目写法。 */
function parseCategory(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  return {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : 1,
    day: match[3] ? Number(match[3]) : 1,
  }
}

const PRESET_MONTHS: Record<Exclude<ZoomPreset, 'all'>, number> = {
  '3m': 3,
  '1y': 12,
  '3y': 36,
}

/**
 * 计算 dataZoom 的 startValue。
 *
 * 以**最后一个类目**为基准往回推，而不是用当前系统时间：
 * 数据可能不是截至今天的，用系统时间会算出空窗口。
 *
 * @returns 起始类目值；'all' 或无数据时返回 undefined（表示不限制）
 */
export function zoomStartValue(categories: string[], preset: ZoomPreset): string | undefined {
  if (preset === 'all' || categories.length === 0) return undefined

  const last = parseCategory(categories[categories.length - 1])
  if (!last) return undefined

  const months = PRESET_MONTHS[preset]

  // 按月份回推
  let targetYear = last.year
  let targetMonth = last.month - months
  while (targetMonth <= 0) {
    targetMonth += 12
    targetYear -= 1
  }

  // 找到第一个 >= 目标的类目
  const target = targetYear * 10_000 + targetMonth * 100 + last.day
  const index = categories.findIndex((item) => {
    const parsed = parseCategory(item)
    if (!parsed) return false
    return parsed.year * 10_000 + parsed.month * 100 + parsed.day >= target
  })

  return index >= 0 ? categories[index] : undefined
}

/** 时间范围偏好。 */
export function useZoomPreset() {
  const preset = ref<ZoomPreset>('1y')

  /**
   * 当前预设下 dataZoom 的起始类目，直接传给 ChartCard 的 zoom-start-value。
   * @param categories 当前 x 轴的类目数组（已解包的普通数组）
   */
  function startValueFor(categories: string[]): string | undefined {
    return zoomStartValue(categories, preset.value)
  }

  return { preset, startValueFor }
}
