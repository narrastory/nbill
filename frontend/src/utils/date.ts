/**
 * 日期工具。
 *
 * ⚠️ 绝对不要用 `new Date().toISOString().slice(0, 10)` 生成"用户本地日期"：
 * 在东八区，当地 00:00–08:00 之间它会给到前一天。
 * 后端所有日期都是本地日历字符串 `YYYY-MM-DD`，这里提供的函数与其口径一致。
 */

/** 生成 `YYYY-MM-DD` 的本地日期字符串。 */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 把本地 Date 对象解析为当天 00:00，避免时区漂移。 */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  // 反向校验，排除 2026-02-30 这类非法日历日期。
  if (date.getFullYear() !== Number(y)) return null
  if (date.getMonth() !== Number(m) - 1) return null
  if (date.getDate() !== Number(d)) return null
  return date
}

/** 是否为合法的 `YYYY-MM-DD` 日历日期。 */
export function isValidDateString(value: string): boolean {
  return parseLocalDate(value) !== null
}

/** 是否为严格晚于今天的日期（未来日期不被分析接口接受）。 */
export function isFutureDate(value: string): boolean {
  const date = parseLocalDate(value)
  if (!date) return false
  return date.getTime() > parseLocalDate(localDateString())!.getTime()
}

/** 日期先后比较；非法日期一律返回 false，交由调用方单独报错。 */
export function isAfter(a: string, b: string): boolean {
  const left = parseLocalDate(a)
  const right = parseLocalDate(b)
  if (!left || !right) return false
  return left.getTime() > right.getTime()
}

/** 在日期上增减天数，返回 `YYYY-MM-DD`。 */
export function addDays(value: string, days: number): string {
  const date = parseLocalDate(value)
  if (!date) return value
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

/** 相对今天偏移若干天的本地日期字符串，常用于"最近 30 天"这类快捷筛选。 */
export function daysAgo(days: number): string {
  return addDays(localDateString(), -days)
}

/** 展示用日期：`2026-09-11` → `2026/09/11`。 */
export function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return '--'
  const date = parseLocalDate(value)
  if (!date) return '--'
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

/** `2026-09` → `2026年9月`。 */
export function formatYearMonthDisplay(value: string | null | undefined): string {
  if (!value) return '--'
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return '--'
  return `${match[1]}年${Number(match[2])}月`
}
