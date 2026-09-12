import { describe, expect, it } from 'vitest'

import {
  addDays,
  daysAgo,
  formatDateDisplay,
  formatYearMonthDisplay,
  isAfter,
  isFutureDate,
  isValidDateString,
  localDateString,
} from './date'

/**
 * 日期工具的关键约定：全程使用**本地日历字符串** `YYYY-MM-DD`。
 *
 * 手册明确禁止 `new Date().toISOString().slice(0,10)` ——
 * 在东八区，当地 00:00–08:00 之间它会给到前一天。
 * 因此这里既测格式，也测"不依赖时区"。
 */
describe('date · 本地日期字符串', () => {
  it('输出 YYYY-MM-DD 格式', () => {
    expect(localDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('用本地时间取值，不受 UTC 偏移影响', () => {
    // 构造当地 00:30 —— 这正是 toISOString() 会算错一天的临界时刻
    const localMidnightish = new Date(2026, 8, 11, 0, 30)
    expect(localDateString(localMidnightish)).toBe('2026-09-11')
  })

  it('当地 23:30 仍应是当天', () => {
    expect(localDateString(new Date(2026, 8, 11, 23, 30))).toBe('2026-09-11')
  })
})

describe('date · 日历日期合法性', () => {
  it('接受合法日期', () => {
    expect(isValidDateString('2026-09-11')).toBe(true)
  })

  it('拒绝不存在的日历日期（不是简单正则能挡住的）', () => {
    // 2 月 30 日、4 月 31 日都是"格式正确但日历上不存在"
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-04-31')).toBe(false)
  })

  it('正确识别闰年 2 月 29 日', () => {
    expect(isValidDateString('2024-02-29')).toBe(true) // 闰年
    expect(isValidDateString('2026-02-29')).toBe(false) // 平年
  })

  it('拒绝格式错误的输入', () => {
    for (const value of ['', 'abc', '2026-9-1', '2026/09/11', '20260911']) {
      expect(isValidDateString(value)).toBe(false)
    }
  })
})

describe('date · 未来日期（分析接口不接受）', () => {
  it('过去与今天都不算未来', () => {
    expect(isFutureDate('2020-01-01')).toBe(false)
    expect(isFutureDate(localDateString())).toBe(false)
  })

  it('明天算未来', () => {
    expect(isFutureDate(addDays(localDateString(), 1))).toBe(true)
  })

  it('非法日期不误判为未来', () => {
    expect(isFutureDate('2026-02-30')).toBe(false)
    expect(isFutureDate('abc')).toBe(false)
  })
})

describe('date · 运算与比较', () => {
  it('addDays 跨月', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('addDays 跨年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('daysAgo 返回过去', () => {
    expect(isAfter(localDateString(), daysAgo(30))).toBe(true)
  })

  it('isAfter 对非法日期一律返回 false，不抛异常', () => {
    expect(isAfter('abc', '2026-01-01')).toBe(false)
    expect(isAfter('2026-01-01', 'abc')).toBe(false)
  })
})

describe('date · 展示格式', () => {
  it('日期显示为斜杠分隔', () => {
    expect(formatDateDisplay('2026-09-11')).toBe('2026/09/11')
  })

  it('空值与非法值显示 --', () => {
    expect(formatDateDisplay(null)).toBe('--')
    expect(formatDateDisplay(undefined)).toBe('--')
    expect(formatDateDisplay('')).toBe('--')
    expect(formatDateDisplay('2026-02-30')).toBe('--')
  })

  it('年月显示为中文月份', () => {
    expect(formatYearMonthDisplay('2026-09')).toBe('2026年9月')
    expect(formatYearMonthDisplay(null)).toBe('--')
    expect(formatYearMonthDisplay('bad')).toBe('--')
  })
})
