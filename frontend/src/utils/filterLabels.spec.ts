import { describe, expect, it } from 'vitest'

import { toExternalFilterChips, toTransactionFilterChips } from './filterLabels'

describe('filterLabels', () => {
  it('returns no chips for an empty query', () => {
    expect(toTransactionFilterChips({})).toEqual([])
    expect(toExternalFilterChips({})).toEqual([])
  })

  it('turns transaction filters into independent user-facing labels', () => {
    expect(
      toTransactionFilterChips({
        type: 'Expense',
        category: '餐饮',
        subcategory: '午餐',
        tag: '工作日',
        description: '咖啡',
        amountMin: 20,
        amountMax: 80,
        dateFrom: '2026-09-01',
        dateTo: '2026-09-11',
      }),
    ).toEqual([
      { key: 'type', label: '支出' },
      { key: 'category', label: '分类：餐饮' },
      { key: 'subcategory', label: '子分类：午餐' },
      { key: 'tag', label: '标签：工作日' },
      { key: 'description', label: '描述含：咖啡' },
      { key: 'amountMin', label: '金额 ≥ ¥20.00' },
      { key: 'amountMax', label: '金额 ≤ ¥80.00' },
      { key: 'dateFrom', label: '从 2026-09-01' },
      { key: 'dateTo', label: '至 2026-09-11' },
    ])
  })

  it('uses cash-flow language for external filters', () => {
    expect(
      toExternalFilterChips({ type: 'OUT', flowType: '借款', relatedParty: '小明' }),
    ).toEqual([
      { key: 'type', label: '流出' },
      { key: 'flowType', label: '往来类型：借款' },
      { key: 'relatedParty', label: '往来方：小明' },
    ])
  })
})
