/**
 * 筛选条件的公共校验。
 *
 * 普通收支与外部往来两个列表的字段集不同，但金额区间与日期区间的
 * 校验规则完全一致，且手册都要求"发请求前前端先校验"：
 *  - 金额：有限数、非负、下限不大于上限；
 *  - 日期：合法日历日期、不晚于今天、开始不晚于结束。
 *
 * 校验失败返回 null 并给出提示，调用方直接中止请求。
 */

import { ElMessage } from 'element-plus'

import { isFutureDate, isValidDateString } from '@/utils/date'

export interface AmountRange {
  amountMin?: number
  amountMax?: number
}

export interface DateRange {
  dateFrom?: string
  dateTo?: string
}

export function useFilterValidation() {
  /**
   * 校验金额区间。
   * @returns 通过时返回可合并进查询参数的对象；失败返回 null
   */
  function validateAmountRange(minText: string, maxText: string): AmountRange | null {
    const result: AmountRange = {}

    const min = minText.trim()
    if (min !== '') {
      const value = Number(min)
      if (!Number.isFinite(value) || value < 0) {
        ElMessage.warning('金额下限必须是不小于 0 的数字')
        return null
      }
      result.amountMin = value
    }

    const max = maxText.trim()
    if (max !== '') {
      const value = Number(max)
      if (!Number.isFinite(value) || value < 0) {
        ElMessage.warning('金额上限必须是不小于 0 的数字')
        return null
      }
      result.amountMax = value
    }

    if (result.amountMin !== undefined && result.amountMax !== undefined) {
      if (result.amountMin > result.amountMax) {
        ElMessage.warning('金额下限不能大于上限')
        return null
      }
    }

    return result
  }

  /**
   * 校验日期区间。
   * @returns 通过时返回可合并进查询参数的对象；失败返回 null
   */
  function validateDateRange(from: string, to: string): DateRange | null {
    const result: DateRange = {}

    for (const [value, label] of [
      [from, '开始日期'],
      [to, '结束日期'],
    ] as const) {
      if (value === '') continue
      if (!isValidDateString(value)) {
        ElMessage.warning(`${label}格式不正确`)
        return null
      }
      if (isFutureDate(value)) {
        ElMessage.warning(`${label}不能晚于今天`)
        return null
      }
    }

    if (from && to && from > to) {
      ElMessage.warning('开始日期不能晚于结束日期')
      return null
    }

    if (from) result.dateFrom = from
    if (to) result.dateTo = to
    return result
  }

  return { validateAmountRange, validateDateRange }
}
