import { http } from './http'

import type {
  DataResult,
  ExternalTransactionQuery,
  HistoricalEditResult,
  MessageResult,
  PageResult,
} from '@/types/api'
import type {
  ExternalTransaction,
  ExternalTransactionDetail,
  ExternalTransactionInput,
} from '@/types/models'

function cleanParams(query: object): Record<string, string | number> {
  const result: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    result[key] = value as string | number
  }
  return result
}

/**
 * `GET /external-transactions`
 * 列表不展开关联记录，只有详情才返回 `relatedTransactions`。
 */
export async function listExternalTransactions(
  query: ExternalTransactionQuery = {},
  signal?: AbortSignal,
): Promise<PageResult<ExternalTransaction>> {
  const { data } = await http.get<PageResult<ExternalTransaction>>('/external-transactions', {
    params: cleanParams(query),
    signal,
  })
  return data
}

/** `GET /external-transactions/:id` —— 详情额外返回已解析的 `relatedTransactions`。 */
export async function getExternalTransaction(
  id: number,
  signal?: AbortSignal,
): Promise<ExternalTransactionDetail> {
  const { data } = await http.get<DataResult<ExternalTransactionDetail>>(
    `/external-transactions/${id}`,
    { signal },
  )
  return data.data
}

/** `POST /external-transactions` —— 字段用驼峰 `FlowType` / `RelatedParty`。 */
export async function createExternalTransaction(
  payload: ExternalTransactionInput,
): Promise<ExternalTransaction> {
  const { data } = await http.post<DataResult<ExternalTransaction>>(
    '/external-transactions',
    payload,
  )
  return data.data
}

/** `PUT /external-transactions/:id` —— `FlowDate` 不可修改。 */
export async function updateExternalTransaction(
  id: number,
  payload: Partial<ExternalTransactionInput>,
  confirmHistoricalEdit = false,
): Promise<DataResult<Partial<ExternalTransaction>> & HistoricalEditResult> {
  const { data } = await http.put<
    DataResult<Partial<ExternalTransaction>> & HistoricalEditResult
  >(
    `/external-transactions/${id}`,
    payload,
    confirmHistoricalEdit ? { params: { confirmHistoricalEdit: 'true' } } : undefined,
  )
  return data
}

/** `DELETE /external-transactions/:id` */
export async function deleteExternalTransaction(id: number): Promise<MessageResult> {
  const { data } = await http.delete<MessageResult>(`/external-transactions/${id}`)
  return data
}
