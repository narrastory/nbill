/**
 * 格式化工具。
 *
 * 核心约束（手册反复强调）：所有 nullable 的百分比、金额一律不能渲染成
 * `NaN` / `undefined` / `null` / `0%`。这里的函数是唯一的格式化入口。
 */

const PLACEHOLDER = '--'

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plainNumberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 金额是否为可安全展示的有限数。 */
function isRenderable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 标准货币展示：`¥1,234.56`。非有限数返回 `--`。 */
export function formatMoney(value: number | null | undefined): string {
  return isRenderable(value) ? currencyFormatter.format(value) : PLACEHOLDER
}

/** 不带货币符号的千分位金额，适合表格列（表头已说明单位）。 */
export function formatAmount(value: number | null | undefined): string {
  return isRenderable(value) ? plainNumberFormatter.format(value) : PLACEHOLDER
}

/**
 * 轴标签用的紧凑金额：十万以上折算为"万"，避免坐标轴拥挤。
 * 账单金额跨度可达数十万，完整千分位会让轴标签互相遮挡。
 */
export function formatCompactMoney(value: number | null | undefined): string {
  if (!isRenderable(value)) return PLACEHOLDER
  const abs = Math.abs(value)
  if (abs >= 10_000) {
    const scaled = value / 10_000
    return `${scaled.toFixed(Math.abs(scaled) >= 100 ? 0 : 1)}万`
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)
}

/** 整数计数；非有限数返回 `0`（计数类指标没有"无数据"语义）。 */
export function formatCount(value: number | null | undefined): string {
  return isRenderable(value) ? new Intl.NumberFormat('zh-CN').format(value) : '0'
}

/**
 * nullable 百分比。
 * `null` → `--`（基数为 0 或不存在基期），绝不显示为 `0%`。
 */
export function formatNullablePercent(value: number | null | undefined, digits = 2): string {
  return isRenderable(value) ? `${value.toFixed(digits)}%` : PLACEHOLDER
}

/** 带正负号的百分比，用于环比/同比这类方向敏感指标。 */
export function formatSignedPercent(value: number | null | undefined, digits = 2): string {
  if (!isRenderable(value)) return PLACEHOLDER
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

/** 金额分布的区间标签：`(min, max]`；`max` 为 null 时表示"高于 min"。 */
export function formatAmountBucket(min: number, max: number | null): string {
  if (max === null) return `高于 ${formatCompactMoney(min)}`
  return `${formatCompactMoney(min)} ~ ${formatCompactMoney(max)}`
}

/** 通用文本兜底：空字符串、null、undefined 一律显示占位符。 */
export function formatText(value: string | null | undefined, fallback = PLACEHOLDER): string {
  if (value === null || value === undefined) return fallback
  const trimmed = value.trim()
  return trimmed === '' ? fallback : trimmed
}

/** 空值占位符，供模板统一引用。 */
export const EMPTY_PLACEHOLDER = PLACEHOLDER

/**
 * 把后端逗号分隔的标签字符串转成数组。
 * 使用英文逗号（后端约定），并过滤空白项。
 */
export function parseTags(tag: string | null | undefined): string[] {
  if (!tag) return []
  return tag
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** 数组转回后端需要的逗号分隔字符串，同时去重。 */
export function serializeTags(tags: readonly string[]): string {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).join(',')
}

/** 把 `RelatedID` 字符串解析为正整数数组。 */
export function parseIds(value: string | null | undefined): number[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
}

/** 把 ID 数组序列化为后端需要的逗号分隔字符串（去重 + 升序）。 */
export function serializeIds(ids: readonly number[]): string {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)))
    .sort((a, b) => a - b)
    .join(',')
}
