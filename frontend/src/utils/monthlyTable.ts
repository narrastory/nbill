/**
 * 月表的「筛选 → 排序 → 分页」逻辑。
 *
 * 刻意做成**纯函数**而不是写在组件里：
 * 这是整个月表唯一有实质分支的部分（年份筛选、两种排序、页码收敛），
 * 抽出来后可以直接单测，不必挂载组件、不依赖 DOM，
 * 组件退化成薄薄的展示层。
 *
 * 数据来源是 `GET /analytics` 的 `monthlySummary`（实测 62 个月）。
 */

import type { MonthlySummary } from '@/types/analytics'

export type MonthlySortKey =
  | 'yearMonth'
  | 'totalIncome'
  | 'totalExpense'
  | 'netProfit'
  | 'frequency'
  | 'foodExpense'
  | 'nonFoodExpense'
  | 'activeChoiceExpense'
  | 'avgPerExpense'

export type SortOrder = 'asc' | 'desc'

export interface MonthlyTableOptions {
  /** 年份筛选；null 表示全部年份。 */
  year: number | null
  sortKey: MonthlySortKey
  sortOrder: SortOrder
  /** 请求的页码，从 1 开始。超出范围会被收敛。 */
  page: number
  pageSize: number
}

export interface MonthlyTableResult {
  /** 当前页的数据。 */
  rows: MonthlySummary[]
  /** 筛选后的总行数（**不是**本页条数）。 */
  total: number
  totalPages: number
  /** 实际生效的页码。请求值越界时会与它不同，组件需据此回写分页器。 */
  page: number
  /** 数据中出现过的年份，降序。 */
  years: number[]
}

/** pageSize 非法时的兜底，避免算出 Infinity 页。 */
const DEFAULT_PAGE_SIZE = 12

/** 严格解析 `YYYY-MM`；不合法返回 null，避免 NaN 混进比较。 */
function parseYearMonth(value: string): { year: number; month: number } | null {
  const matched = /^(\d{4})-(\d{2})$/.exec(value)
  if (!matched) return null
  return { year: Number(matched[1]), month: Number(matched[2]) }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function selectMonthlyRows(
  months: readonly MonthlySummary[],
  options: MonthlyTableOptions,
): MonthlyTableResult {
  // 1) 年份候选：去重 + 降序，供筛选标签使用
  const yearSet = new Set<number>()
  for (const item of months) {
    const parsed = parseYearMonth(item.yearMonth)
    if (parsed) yearSet.add(parsed.year)
  }
  const years = [...yearSet].sort((a, b) => b - a)

  // 2) 年份筛选
  const filtered =
    options.year === null
      ? months
      : months.filter((item) => parseYearMonth(item.yearMonth)?.year === options.year)

  // 3) 排序。先复制再排 —— 不能就地改调用方传进来的数组，
  //    否则 store 里的原始数据会被打乱，切换到分析页时图表顺序就跟着变。
  const sorted = filtered.slice().sort((a, b) => {
    const factor = options.sortOrder === 'asc' ? 1 : -1
    if (options.sortKey === 'yearMonth') {
      // `YYYY-MM` 的字典序与时间序一致，无需转 Date
      return a.yearMonth.localeCompare(b.yearMonth) * factor
    }
    return (a[options.sortKey] - b[options.sortKey]) * factor
  })

  // 4) 分页。页码收敛很重要：筛选后总页数会变，
  //    若停留在旧页码就会落在不存在的空页上（同"删除后页码回退"的处理思路）。
  const pageSize =
    Number.isFinite(options.pageSize) && options.pageSize > 0
      ? Math.floor(options.pageSize)
      : DEFAULT_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = clamp(Math.floor(options.page ?? 1) || 1, 1, totalPages)
  const start = (page - 1) * pageSize

  return {
    rows: sorted.slice(start, start + pageSize),
    total: sorted.length,
    totalPages,
    page,
    years,
  }
}
