/**
 * 图表主题：把设计令牌翻译成 ECharts 的配置片段。
 *
 * 所有颜色都从 CSS 变量读取，不在 JS 里再写一份十六进制 ——
 * 改主题色只需要改 theme.css 一处。
 *
 * 调色板已用 dataviz 的校验脚本验证过（浅色底）：
 *   亮度带 PASS · 彩度下限 PASS · CVD 相邻分离 PASS（最差 ΔE 10.1 deutan）
 *   正常视觉下限 PASS（22.9）· 对比度 WARN
 * 对比度 WARN 要求"必须有可见文字标签或表格视图"作为补偿，
 * 因此每个图表都强制带文字图例与 tooltip，离散清单类数据用表格呈现。
 */

import type { EChartsOption } from './echarts'
import { LOG_FLOOR } from '@/utils/chart'

export interface ChartTokens {
  text: string
  textMuted: string
  textSubtle: string
  border: string
  surface: string
  income: string
  expense: string
  warning: string
  /**
   * 比主色更深的一档绿，用于在同一系列内强调某一项（例如消费最高的一天）。
   * 刻意不用红色——红色在本项目里表示"支出"，若所有柱子本来就是支出，
   * 单独把一根染红会被读成"另一种类别"，而不是"这一根更突出"。
   */
  primaryDeep: string
  palette: string[]
}

/** 从 :root 读取当前主题令牌。SSR 或测试环境下退化为空值。 */
export function readChartTokens(): ChartTokens {
  if (typeof window === 'undefined') {
    return {
      text: '#1e293b',
      textMuted: '#64748b',
      textSubtle: '#94a3b8',
      border: '#e2e8f0',
      surface: '#ffffff',
      income: '#059669',
      expense: '#e11d48',
      warning: '#f59e0b',
      primaryDeep: '#15803d',
      palette: [],
    }
  }

  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback

  const palette: string[] = []
  for (let index = 1; index <= 10; index += 1) {
    const value = styles.getPropertyValue(`--nb-chart-${index}`).trim()
    if (value) palette.push(value)
  }

  return {
    text: read('--nb-text', '#1e293b'),
    textMuted: read('--nb-text-muted', '#64748b'),
    textSubtle: read('--nb-text-subtle', '#94a3b8'),
    border: read('--nb-border', '#e2e8f0'),
    surface: read('--nb-surface', '#ffffff'),
    income: read('--nb-income', '#059669'),
    expense: read('--nb-expense', '#e11d48'),
    warning: read('--nb-warning', '#f59e0b'),
    primaryDeep: read('--nb-primary-hover', '#15803d'),
    palette,
  }
}

/**
 * 网格：左侧留白给 y 轴标签，底部留白给 dataZoom（若有）与 x 轴标签。
 *
 * ECharts 6 已弃用 `grid.containLabel`，官方给出的等价写法是
 * `{ outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' }`。
 * 继续用旧写法只会打印弃用警告（并需要额外注册 LegacyGridContainLabel）。
 * 效果：轴标签溢出时收缩绘图区，避免标签被容器裁掉。
 */
export function baseGrid(options: { withZoom?: boolean; compact?: boolean } = {}) {
  const { withZoom = false, compact = false } = options
  return {
    left: compact ? 8 : 12,
    right: 16,
    top: 36,
    bottom: withZoom ? 56 : 8,
    outerBoundsMode: 'same' as const,
    outerBoundsContain: 'axisLabel' as const,
  }
}

/** 类目轴（时间/月份等）。标签重叠时自动隐藏，不做旋转——旋转的中文日期在小屏上不可读。 */
export function categoryAxis(tokens: ChartTokens, data: string[], withZoom = false) {
  return {
    type: 'category' as const,
    data,
    boundaryGap: true,
    axisLine: { lineStyle: { color: tokens.border } },
    axisTick: { show: false },
    axisLabel: {
      color: tokens.textMuted,
      fontSize: 11,
      hideOverlap: true,
      // dataZoom 会压缩标签，留出间距让隐藏策略生效
      margin: 10,
    },
    ...(withZoom ? { axisPointer: { label: { show: false } } } : {}),
  }
}

/**
 * 数值轴：线性 / 对数统一在这里构造。
 *
 * 之前 buildValueAxis（utils）与 valueAxisStyle（theme）都会设置 axisLine、
 * axisLabel、splitLine，两个来源互相覆盖，调一处不管用。
 * 现在合并成一个函数，顺序不再有歧义。
 *
 * 对数轴需要可见的轴线，否则 minorTick 会变成一排悬空的小横线。
 */
export function valueAxis(
  tokens: ChartTokens,
  options: { log?: boolean; name?: string; hasRenderableData?: boolean } = {},
) {
  const { log = false, name, hasRenderableData = true } = options

  const base = {
    name,
    // 注意：不能写 `[0, 0, 0, -4] as const`，readonly 元组无法赋给 ECharts 的
    // `number[]`，会让整个 option 推断失败。
    nameTextStyle: { color: tokens.textSubtle, fontSize: 11, padding: [0, 0, 0, -4] as number[] },
    axisLabel: {
      color: tokens.textMuted,
      fontSize: 11,
      formatter: (value: number) => axisNumber(value),
    },
    splitLine: { lineStyle: { color: tokens.border, type: 'dashed' as const } },
  }

  if (!log) {
    return {
      ...base,
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
    }
  }

  return {
    ...base,
    type: 'log' as const,
    logBase: 10,
    // 只有确实没有可表示的正数值时才给地板 min，避免全空数据推出 NaN 刻度。
    // 否则交给 ECharts 按真实数据推导——写死地板会把轴拉出数量级跨度。
    ...(hasRenderableData ? {} : { min: LOG_FLOOR }),
    axisLine: { show: true, lineStyle: { color: tokens.border } },
    axisTick: { show: true, length: 4, lineStyle: { color: tokens.border } },
    minorTick: { show: true, length: 2, lineStyle: { color: tokens.border } },
    minorSplitLine: { show: true, lineStyle: { color: tokens.border, opacity: 0.4 } },
  }
}

/** 轴标签数字兜底：非有限数一律不渲染。 */
function axisNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 10_000) {
    const scaled = value / 10_000
    return `${scaled.toFixed(Math.abs(scaled) >= 100 ? 0 : 1)}万`
  }
  return String(Number(value.toFixed(2)))
}

/**
 * tooltip 外观。
 * 内容格式化统一交给 utils/chart.ts 的 createTooltipFormatter，
 * 这里只管样式，避免两处都写兜底逻辑。
 */
export function tooltipStyle(tokens: ChartTokens) {
  return {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: tokens.text, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 24px -12px rgb(15 23 42 / 0.18); border-radius: 8px;',
  }
}

/** 图例：≥2 个系列时必须存在，文字用中性色而不是系列色。 */
export function legendStyle(tokens: ChartTokens, show: boolean) {
  return {
    show,
    top: 0,
    right: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    icon: 'roundRect',
    textStyle: { color: tokens.textMuted, fontSize: 11 },
  }
}

/**
 * dataZoom 预设：滚轮/双指缩放 + 底部滑块。
 *
 * ⚠️ 必须成对使用同一份 startValue。
 * 早先的做法是外壳先加一组默认的 inside/slider，调用方再追加一组带
 * startValue 的，结果同类型组件出现两份、配置互相覆盖，
 * 表现为"区间按钮高亮着但图表仍显示全部数据"。
 * 因此这里统一构造，调用方不再自己拼 dataZoom。
 */
export function dataZoomConfig(withZoom: boolean, startValue?: string, tokens?: ChartTokens) {
  if (!withZoom) return []
  const range = startValue ? { startValue } : {}
  return [
    { type: 'inside' as const, throttle: 60, ...range },
    {
      type: 'slider' as const,
      height: 20,
      bottom: 8,
      brushSelect: false,
      borderColor: 'transparent',
      fillerColor: tokens?.border ?? '#d7dfda',
      handleStyle: { color: tokens?.primaryDeep ?? '#123f32' },
      moveHandleStyle: { color: tokens?.primaryDeep ?? '#123f32' },
      textStyle: { fontSize: 10 },
      dataBackground: {
        lineStyle: { opacity: 0.3 },
        areaStyle: { opacity: 0.12 },
      },
      ...range,
    },
  ]
}

/** 折线系列的公共样式：细线、圆点、不在每个点上堆数字。 */
export function lineSeriesStyle(tokens: ChartTokens, color: string, pointCount: number) {
  const palette = tokens.palette.length > 0 ? tokens.palette : [color]
  const resolved = color === 'palette' ? palette[0] : color
  return {
    type: 'line' as const,
    smooth: false,
    symbol: 'circle',
    symbolSize: pointCount > 40 ? 0 : 7,
    showSymbol: pointCount <= 40,
    lineStyle: { width: 2 },
    itemStyle: { color: resolved },
    // 断点不连线：null 是"无数据"，补 0 会伪造出趋势
    connectNulls: false,
    emphasis: { focus: 'series' as const },
  }
}

/** 柱状系列：细柱、圆角数据端、相邻柱之间留出表面间隙。 */
export function barSeriesStyle(color: string, stacked = false) {
  return {
    type: 'bar' as const,
    barMaxWidth: 28,
    itemStyle: {
      color,
      borderRadius: stacked
        ? [0, 0, 0, 0]
        : ([4, 4, 0, 0] as [number, number, number, number]),
    },
    ...(stacked ? { stack: 'total' } : {}),
  }
}

/** 空数据图表的兜底 option，避免渲染出一个空坐标系。 */
export function emptyOption(tokens: ChartTokens): EChartsOption {
  return {
    title: {
      text: '暂无数据',
      left: 'center',
      top: 'middle',
      textStyle: { color: tokens.textSubtle, fontSize: 13, fontWeight: 'normal' as const },
    },
  }
}
