/**
 * 图表通用工具。
 *
 * 汇报了两个全站硬约束：
 *  1. 普通坐标轴 / 对数坐标轴必须可切换。账单金额跨度从 0 到数十万，
 *     对数轴能同时看清小额与大额；但对数轴不能表示 0 与负数。
 *  2. 所有 tooltip 与标签都必须兜底：绝不能出现 `NaN` / `Infinity` /
 *     `undefined` / `null`。无数据时显示"无"。
 *
 * 因此对数值的处理策略是"显式降级"而不是"交给 ECharts 兜底"：
 * 在进入坐标系之前就把不可表示的点过滤掉或标记出来，并让 tooltip 知情。
 */

/** 无数据时的统一文案。 */
export const NO_DATA_TEXT = '无'

/**
 * 转义 HTML 特殊字符。
 *
 * ECharts 的 tooltip formatter 返回的字符串会被当成 **HTML** 插入（innerHTML），
 * 而 tooltip 里要插入的系列名、类目名、分类名全部来自用户录入的账本数据。
 * 若某条记录的分类名写成 `<img src=x onerror=…>`，不做转义就会执行。
 *
 * 本项目是本地单用户工具，但仍要转义：
 * 账本文件是可移植、可分享的，且"本地所以不用管安全"不是个好理由。
 * 注意：ECharts 自己生成的 `marker`（颜色小圆点）是**有意为之的 HTML**，
 * 必须原样保留，只转义数据来源的文本。
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 该数值能否出现在对数轴上。 */
export function isLogRenderable(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * 对数轴的最小安全值。ECharts 在 log 轴遇到 <= 0 时会算出 NaN 刻度，
 * 因此传入前必须过滤；这里给一个统一的极小正数作为"地板"。
 */
export const LOG_FLOOR = 0.01

/**
 * 把数值映射到对数轴可用的区间。
 * 不可表示（<= 0 / NaN / Infinity）时返回 `null`，由调用方决定是断点还是丢弃。
 */
export function toLogValue(value: number | null | undefined): number | null {
  if (!isLogRenderable(value)) return null
  const v = value as number
  return v < LOG_FLOOR ? LOG_FLOOR : v
}

/**
 * 构造一条"对数安全"的系列数据。
 * 不可表示的点保留位置但置为 `null`，ECharts 会断线而不报错；
 * 同时返回这些点的索引，便于 tooltip 显示"无"。
 */
export function toLogSafeData(values: Array<number | null | undefined>): {
  data: Array<number | null>
  omittedIndexes: number[]
} {
  const omittedIndexes: number[] = []
  const data = values.map((value, index) => {
    const mapped = toLogValue(value)
    if (mapped === null) omittedIndexes.push(index)
    return mapped
  })
  return { data, omittedIndexes }
}

/** 数据中是否有可出现在对数轴上的值。 */
export function hasRenderableValues(values: Array<number | null | undefined>): boolean {
  return values.some((value) => isLogRenderable(value))
}

/**
 * 构造一个"永不输出 NaN/undefined"的 tooltip formatter。
 *
 * @param valueFormatter 单个数值的展示函数（通常是 formatMoney）
 * @param options.valueLabel 数值前缀文案，例如 "金额"
 * @param options.emptyText 无数据文案，默认"无"
 */
export function createTooltipFormatter(
  valueFormatter: (value: number | null | undefined) => string,
  options: { valueLabel?: string; emptyText?: string } = {},
) {
  const { valueLabel, emptyText = NO_DATA_TEXT } = options

  return (params: unknown): string => {
    const list = Array.isArray(params) ? params : [params]
    if (list.length === 0) return emptyText

    const rows = list
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const p = item as {
          seriesName?: string
          name?: string
          value?: unknown
          marker?: string
          percent?: unknown
        }

        const raw = p.value
        // 值可能来自对数映射（null 表示"无"），也可能是 ECharts 的多维数组。
        const numeric = Array.isArray(raw)
          ? (raw[raw.length - 1] as unknown)
          : raw

        const text =
          typeof numeric === 'number' && Number.isFinite(numeric)
            ? valueFormatter(numeric)
            : emptyText

        const percentText =
          typeof p.percent === 'number' && Number.isFinite(p.percent)
            ? ` (${p.percent.toFixed(2)}%)`
            : ''

        // 系列名与类目名来自用户录入的数据，必须转义后再拼进 HTML。
        // marker 是 ECharts 生成的颜色圆点，属于有意为之的 HTML，保持原样。
        const rawName = p.seriesName ?? p.name ?? ''
        const name = rawName ? escapeHtml(rawName) : ''
        const prefix = name ? `${p.marker ?? ''}${name}：` : (p.marker ?? '')
        const label = valueLabel ? `${valueLabel} ` : ''
        return `${prefix}${label}${text}${percentText}`
      })
      .filter((row): row is string => row !== null)

    if (rows.length === 0) return emptyText
    return rows.join('<br/>')
  }
}

/**
 * `prefers-reduced-motion` 查询。图表动画应据此关闭或大幅缩短，
 * 与全局 CSS 的降级策略保持一致。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 根据偏好返回图表动画配置。 */
export function chartAnimation(reduced = prefersReducedMotion()) {
  return reduced ? { animation: false as const } : { animation: true, animationDuration: 420 }
}

/** 从 CSS 变量读取图表调色板，保证图表与主题同源。 */
export function readChartPalette(): string[] {
  if (typeof window === 'undefined') return []
  const styles = getComputedStyle(document.documentElement)
  return Array.from({ length: 10 }, (_, index) => {
    const value = styles.getPropertyValue(`--nb-chart-${index + 1}`).trim()
    return value
  }).filter((value) => value !== '')
}
