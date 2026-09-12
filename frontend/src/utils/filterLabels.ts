import type { ExternalTransactionQuery, TransactionQuery } from '@/types/api'
import { formatAmount } from './format'

export interface FilterChip {
  key: string
  label: string
}

function commonChips(
  query: Pick<
    TransactionQuery,
    'description' | 'amountMin' | 'amountMax' | 'dateFrom' | 'dateTo'
  >,
): FilterChip[] {
  const chips: FilterChip[] = []
  if (query.description) chips.push({ key: 'description', label: `描述含：${query.description}` })
  if (query.amountMin !== undefined) {
    chips.push({ key: 'amountMin', label: `金额 ≥ ¥${formatAmount(query.amountMin)}` })
  }
  if (query.amountMax !== undefined) {
    chips.push({ key: 'amountMax', label: `金额 ≤ ¥${formatAmount(query.amountMax)}` })
  }
  if (query.dateFrom) chips.push({ key: 'dateFrom', label: `从 ${query.dateFrom}` })
  if (query.dateTo) chips.push({ key: 'dateTo', label: `至 ${query.dateTo}` })
  return chips
}

export function toTransactionFilterChips(query: TransactionQuery): FilterChip[] {
  const chips: FilterChip[] = []
  if (query.type) chips.push({ key: 'type', label: query.type === 'Income' ? '收入' : '支出' })
  if (query.category) chips.push({ key: 'category', label: `分类：${query.category}` })
  if (query.subcategory) {
    chips.push({ key: 'subcategory', label: `子分类：${query.subcategory}` })
  }
  if (query.tag) chips.push({ key: 'tag', label: `标签：${query.tag}` })
  return [...chips, ...commonChips(query)]
}

export function toExternalFilterChips(query: ExternalTransactionQuery): FilterChip[] {
  const chips: FilterChip[] = []
  if (query.type) chips.push({ key: 'type', label: query.type === 'IN' ? '流入' : '流出' })
  if (query.flowType) chips.push({ key: 'flowType', label: `往来类型：${query.flowType}` })
  if (query.relatedParty) {
    chips.push({ key: 'relatedParty', label: `往来方：${query.relatedParty}` })
  }
  return [...chips, ...commonChips(query)]
}
