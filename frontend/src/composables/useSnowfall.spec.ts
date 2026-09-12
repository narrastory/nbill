import { describe, expect, it } from 'vitest'

import { isSnowSeason } from './useSnowfall'

/**
 * 雪花季边界：每年 11 月 7 日 ~ 次年 2 月 4 日，**含首尾两天**。
 *
 * 区间跨年，不能用简单的月份比较，因此边界必须逐个钉死 ——
 * 差一天就是"11 月 6 日就下雪"或"2 月 4 日不下雪"，
 * 而这两种偏差在日常生活中很难被察觉，只能靠测试守住。
 */
describe('isSnowSeason · 雪花季边界', () => {
  const cases: Array<[string, boolean, string]> = [
    ['2026-11-05', false, '起始前 2 天'],
    ['2026-11-06', false, '起始前一天'],
    ['2026-11-07', true, '起始当天（含边界）'],
    ['2026-11-08', true, '起始后一天'],
    ['2026-11-30', true, '11 月最后一天'],
    ['2026-12-01', true, '12 月第一天'],
    ['2026-12-31', true, '跨年前一天'],
    ['2027-01-01', true, '跨年后一天'],
    ['2027-01-31', true, '1 月最后一天'],
    ['2027-02-03', true, '结束前一天'],
    ['2027-02-04', true, '结束当天（含边界）'],
    ['2027-02-05', false, '结束后一天'],
    ['2026-03-01', false, '3 月'],
    ['2026-06-15', false, '6 月'],
    ['2026-09-11', false, '9 月'],
    ['2026-10-31', false, '10 月最后一天'],
  ]

  it.each(cases)('%s → %s（%s）', (iso, expected) => {
    const [year, month, day] = iso.split('-').map(Number)
    // 用本地时间构造，与实现的取值方式一致
    expect(isSnowSeason(new Date(year, month - 1, day))).toBe(expected)
  })

  it('跨年区间连续：11-07 到次年 02-04 之间每天都应生效', () => {
    const start = new Date(2026, 10, 7) // 2026-11-07
    const end = new Date(2027, 1, 4) // 2027-02-04
    const cursor = new Date(start)
    let checked = 0
    while (cursor.getTime() <= end.getTime()) {
      expect(isSnowSeason(new Date(cursor))).toBe(true)
      cursor.setDate(cursor.getDate() + 1)
      checked += 1
    }
    // 11/7 ~ 12/31 = 55 天，1/1 ~ 2/4 = 35 天，共 90 天
    expect(checked).toBe(90)
  })
})
