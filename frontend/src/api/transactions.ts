import { http } from './http'

import type {
  DataResult,
  HistoricalEditResult,
  MessageResult,
  PageResult,
  TransactionQuery,
} from '@/types/api'
import type { Transaction, TransactionInput } from '@/types/models'

/** 移除值为 undefined / null / 空字符串的查询参数，避免发送 "undefined"。 */
function cleanParams(query: object): Record<string, string | number> {
  const result: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    result[key] = value as string | number
  }
  return result
}

/** `GET /transactions` */
export async function listTransactions(
  query: TransactionQuery = {},
  signal?: AbortSignal,
): Promise<PageResult<Transaction>> {
  const { data } = await http.get<PageResult<Transaction>>('/transactions', {
    params: cleanParams(query),
    signal,
  })
  return data
}

/** `GET /transactions/:id` */
export async function getTransaction(id: number, signal?: AbortSignal): Promise<Transaction> {
  const { data } = await http.get<DataResult<Transaction>>(`/transactions/${id}`, { signal })
  return data.data
}

/** `POST /transactions` */
export async function createTransaction(payload: TransactionInput): Promise<Transaction> {
  const { data } = await http.post<DataResult<Transaction>>('/transactions', payload)
  return data.data
}

/**
 * `PUT /transactions/:id`
 *
 * `confirmHistoricalEdit` 只有在用户显式确认后才传 true。
 * 绝不能默认附加该参数，否则会跳过二次确认。
 * `BillDate` 不可修改，调用方应从 payload 中排除。
 */
export async function updateTransaction(
  id: number,
  payload: Partial<TransactionInput>,
  confirmHistoricalEdit = false,
): Promise<DataResult<Partial<Transaction>> & HistoricalEditResult> {
  const { data } = await http.put<DataResult<Partial<Transaction>> & HistoricalEditResult>(
    `/transactions/${id}`,
    payload,
    confirmHistoricalEdit ? { params: { confirmHistoricalEdit: 'true' } } : undefined,
  )
  return data
}

/**
 * `DELETE /transactions/:id`
 * 历史记录删除没有确认绕过机制，超过编辑窗口会失败。
 */
export async function deleteTransaction(id: number): Promise<MessageResult> {
  const { data } = await http.delete<MessageResult>(`/transactions/${id}`)
  return data
}
