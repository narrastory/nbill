import { describe, expect, it } from 'vitest'

import { selectMonthlyRows, type MonthlySortKey } from './monthlyTable'
import type { MonthlySummary } from '@/types/analytics'

/** 造一条月度数据，只关心会被用到的字段。 */
function month(yearMonth: string, overrides: Partial<MonthlySummary> = {}): MonthlySummary {
  return {
    yearMonth,
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0,
    frequency: 0,
    expenseCount: 0,
    incomeCount: 0,
    foodExpense: 0,
    nonFoodExpense: 0,
    activeChoiceExpense: 0,
    avgPerExpense: 0,
    ...overrides,
  }
}

/** 2021-08 .. 2021-12、2022-01、2026-09 共 7 个月，跨 3 个年份。 */
const FIXTURE: MonthlySummary[] = [
  month('2021-08', { totalIncome: 0, totalExpense: 459.6, netProfit: -459.6, frequency: 8, avgPerExpense: 57.45 }),
  month('2021-09', { totalIncome: 100, totalExpense: 50, netProfit: 50, frequency: 2 }),
  month('2021-10', { totalIncome: 200, totalExpense: 20, netProfit: 180, frequency: 3 }),
  month('2021-11', { totalIncome: 300, totalExpense: 30, netProfit: 270, frequency: 4 }),
  month('2021-12', { totalIncome: 400, totalExpense: 40, netProfit: 360, frequency: 5 }),
  month('2022-01', { totalIncome: 500, totalExpense: 10, netProfit: 490, frequency: 6 }),
  month('2026-09', { totalIncome: 900, totalExpense: 90, netProfit: 810, frequency: 9 }),
]

const ALL = { year: null, sortKey: 'yearMonth' as MonthlySortKey, sortOrder: 'desc' as const, page: 1, pageSize: 12 }

describe('selectMonthlyRows · 年份提取与筛选', () => {
  it('从 yearMonth 前缀提取年份，去重并降序', () => {
    expect(selectMonthlyRows(FIXTURE, ALL).years).toEqual([2026, 2022, 2021])
  })

  it('year 为 null 时返回全部月份', () => {
    expect(selectMonthlyRows(FIXTURE, ALL).total).toBe(7)
  })

  it('指定年份时只返回该年', () => {
    const result = selectMonthlyRows(FIXTURE, { ...ALL, year: 2021 })
    expect(result.total).toBe(5)
    expect(result.rows.every((row) => row.yearMonth.startsWith('2021'))).toBe(true)
  })

  it('筛到没有数据的年份时返回空，而不是报错', () => {
    const result = selectMonthlyRows(FIXTURE, { ...ALL, year: 1999 })
    expect(result.total).toBe(0)
    expect(result.rows).toEqual([])
    expect(result.totalPages).toBe(1)
  })

  it('空输入不报错', () => {
    const result = selectMonthlyRows([], ALL)
    expect(result).toMatchObject({ rows: [], total: 0, totalPages: 1, years: [] })
  })
})

describe('selectMonthlyRows · 排序', () => {
  it('按年份月份降序（默认）', () => {
    const rows = selectMonthlyRows(FIXTURE, ALL).rows
    expect(rows[0].yearMonth).toBe('2026-09')
    expect(rows.map((r) => r.yearMonth)).toEqual([
      '2026-09', '2022-01', '2021-12', '2021-11', '2021-10', '2021-09', '2021-08',
    ])
  })

  it('按年份月份升序', () => {
    const rows = selectMonthlyRows(FIXTURE, { ...ALL, sortOrder: 'asc' }).rows
    expect(rows[0].yearMonth).toBe('2021-08')
    expect(rows[6].yearMonth).toBe('2026-09')
  })

  it('按数值列排序', () => {
    const rows = selectMonthlyRows(FIXTURE, { ...ALL, sortKey: 'totalIncome', sortOrder: 'desc' }).rows
    expect(rows.map((r) => r.totalIncome)).toEqual([900, 500, 400, 300, 200, 100, 0])
  })

  it('净结余可为负，排序要按数值而不是绝对值', () => {
    const rows = selectMonthlyRows(FIXTURE, { ...ALL, sortKey: 'netProfit', sortOrder: 'asc' }).rows
    expect(rows[0].netProfit).toBe(-459.6)
    expect(rows[rows.length - 1].netProfit).toBe(810)
  })

  it('不修改传入的数组（排序不能就地改原数据）', () => {
    const input = [...FIXTURE]
    const before = input.map((m) => m.yearMonth)
    selectMonthlyRows(input, { ...ALL, sortKey: 'totalIncome', sortOrder: 'asc' })
    expect(input.map((m) => m.yearMonth)).toEqual(before)
  })
})

describe('selectMonthlyRows · 分页', () => {
  const paged = { ...ALL, sortOrder: 'asc' as const, pageSize: 3 }

  it('按 pageSize 切片，total 是筛选后的总数而不是当页条数', () => {
    const result = selectMonthlyRows(FIXTURE, paged)
    expect(result.rows).toHaveLength(3)
    expect(result.total).toBe(7)
    expect(result.totalPages).toBe(3)
  })

  it('最后一页只返回剩余行', () => {
    const result = selectMonthlyRows(FIXTURE, { ...paged, page: 3 })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].yearMonth).toBe('2026-09')
  })

  it('页码超出范围时收敛到最后一页，避免落在不存在的空页', () => {
    // 先筛到只有 5 条的 2021，再请求第 9 页
    const result = selectMonthlyRows(FIXTURE, { ...paged, year: 2021, page: 9 })
    expect(result.page).toBe(2) // ceil(5 / 3) = 2
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it('页码小于 1 时收敛到第 1 页', () => {
    expect(selectMonthlyRows(FIXTURE, { ...paged, page: 0 }).page).toBe(1)
    expect(selectMonthlyRows(FIXTURE, { ...paged, page: -3 }).page).toBe(1)
  })

  it('pageSize 非法时回退到默认值，避免算出 Infinity 页', () => {
    const result = selectMonthlyRows(FIXTURE, { ...paged, pageSize: 0 })
    expect(Number.isFinite(result.totalPages)).toBe(true)
    expect(result.totalPages).toBeGreaterThan(0)
  })

  it('筛选与分页组合：先筛选再分页', () => {
    const result = selectMonthlyRows(FIXTURE, { ...paged, year: 2021, page: 2 })
    expect(result.total).toBe(5)
    expect(result.totalPages).toBe(2)
    expect(result.rows).toHaveLength(2)
  })
})
