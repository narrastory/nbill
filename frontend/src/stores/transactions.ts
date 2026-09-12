/**
 * 账单域：普通收支 + 外部往来的列表状态。
 *
 * 列表策略（手册 FRONTEND_GUIDE「分页、筛选和排序」）：
 *  - 筛选/排序变化后页码重置为 1；
 *  - 总页数用后端 total 计算，不靠本页条数猜；
 *  - 写操作成功后重新请求当前列表，不自行改本地数组，
 *    否则排序与页码容易错乱；
 *  - 删除当前页最后一条时回退一页，避免落在不存在的空页。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { externalTransactionsApi, transactionsApi } from '@/api'
import { useAnalyticsStore } from './analytics'
import { useSystemStore } from './system'
import type { ExternalTransactionQuery, TransactionQuery } from '@/types/api'
import { ApiError } from '@/types/api'
import type {
  ExternalTransaction,
  ExternalTransactionInput,
  Transaction,
  TransactionInput,
} from '@/types/models'

const DEFAULT_LIMIT = 50

export const useTransactionsStore = defineStore('transactions', () => {
  /* ------------------------------ 普通收支 ------------------------------ */

  const transactionRows = ref<Transaction[]>([])
  const transactionTotal = ref(0)
  const transactionPage = ref(1)
  const transactionLimit = ref(DEFAULT_LIMIT)
  const transactionQuery = ref<TransactionQuery>({})
  const transactionLoading = ref(false)
  const transactionError = ref<string | null>(null)

  const transactionTotalPages = computed(() =>
    Math.max(1, Math.ceil(transactionTotal.value / transactionLimit.value)),
  )

  /* ------------------------------ 外部往来 ------------------------------ */

  const externalRows = ref<ExternalTransaction[]>([])
  const externalTotal = ref(0)
  const externalPage = ref(1)
  const externalLimit = ref(DEFAULT_LIMIT)
  const externalQuery = ref<ExternalTransactionQuery>({})
  const externalLoading = ref(false)
  const externalError = ref<string | null>(null)

  const externalTotalPages = computed(() =>
    Math.max(1, Math.ceil(externalTotal.value / externalLimit.value)),
  )

  function handleError(target: { value: string | null }, e: unknown): void {
    if (e instanceof ApiError && e.isCanceled) return
    target.value = e instanceof Error ? e.message : '加载失败'
  }

  /**
   * 写操作后的统一收尾：刷新列表 + 失效统计缓存 + 同步记录数。
   * 手册「写操作后的缓存失效」表格的最小实现。
   */
  function invalidateDerived(): void {
    useAnalyticsStore().invalidate()
  }

  /* ------------------------------ 普通收支动作 --------------------------- */

  async function loadTransactions(
    overrides: Partial<TransactionQuery> = {},
    signal?: AbortSignal,
  ): Promise<void> {
    transactionLoading.value = true
    transactionError.value = null
    try {
      const query: TransactionQuery = {
        ...transactionQuery.value,
        ...overrides,
        page: overrides.page ?? transactionPage.value,
        limit: transactionLimit.value,
      }
      const result = await transactionsApi.listTransactions(query, signal)
      transactionRows.value = result.data
      transactionTotal.value = result.total
      transactionPage.value = result.page
      transactionLimit.value = result.limit
    } catch (e) {
      handleError(transactionError, e)
    } finally {
      transactionLoading.value = false
    }
  }

  /** 应用筛选条件：页码重置为 1。 */
  async function applyTransactionQuery(
    query: TransactionQuery,
    signal?: AbortSignal,
  ): Promise<void> {
    transactionQuery.value = { ...query }
    transactionPage.value = 1
    await loadTransactions({ page: 1 }, signal)
  }

  async function createTransaction(payload: TransactionInput): Promise<Transaction> {
    const created = await transactionsApi.createTransaction(payload)
    useSystemStore().adjustCount('transactions', 1)
    invalidateDerived()
    return created
  }

  /** 历史记录：首次 403 由调用方确认后，再以 confirm=true 重试一次。 */
  async function updateTransaction(
    id: number,
    payload: Partial<TransactionInput>,
    confirmHistoricalEdit = false,
  ) {
    const result = await transactionsApi.updateTransaction(id, payload, confirmHistoricalEdit)
    invalidateDerived()
    return result
  }

  /** 删除后若当前页已空则回退一页（手册建议的页码处理）。 */
  async function deleteTransaction(id: number): Promise<void> {
    await transactionsApi.deleteTransaction(id)
    useSystemStore().adjustCount('transactions', -1)
    invalidateDerived()
    if (transactionRows.value.length === 1 && transactionPage.value > 1) {
      transactionPage.value -= 1
    }
    await loadTransactions()
  }

  /* ------------------------------ 外部往来动作 --------------------------- */

  async function loadExternalTransactions(
    overrides: Partial<ExternalTransactionQuery> = {},
    signal?: AbortSignal,
  ): Promise<void> {
    externalLoading.value = true
    externalError.value = null
    try {
      const query: ExternalTransactionQuery = {
        ...externalQuery.value,
        ...overrides,
        page: overrides.page ?? externalPage.value,
        limit: externalLimit.value,
      }
      const result = await externalTransactionsApi.listExternalTransactions(query, signal)
      externalRows.value = result.data
      externalTotal.value = result.total
      externalPage.value = result.page
      externalLimit.value = result.limit
    } catch (e) {
      handleError(externalError, e)
    } finally {
      externalLoading.value = false
    }
  }

  async function applyExternalQuery(
    query: ExternalTransactionQuery,
    signal?: AbortSignal,
  ): Promise<void> {
    externalQuery.value = { ...query }
    externalPage.value = 1
    await loadExternalTransactions({ page: 1 }, signal)
  }

  async function createExternalTransaction(
    payload: ExternalTransactionInput,
  ): Promise<ExternalTransaction> {
    const created = await externalTransactionsApi.createExternalTransaction(payload)
    useSystemStore().adjustCount('externalTransactions', 1)
    invalidateDerived()
    return created
  }

  async function updateExternalTransaction(
    id: number,
    payload: Partial<ExternalTransactionInput>,
    confirmHistoricalEdit = false,
  ) {
    const result = await externalTransactionsApi.updateExternalTransaction(
      id,
      payload,
      confirmHistoricalEdit,
    )
    invalidateDerived()
    return result
  }

  async function deleteExternalTransaction(id: number): Promise<void> {
    await externalTransactionsApi.deleteExternalTransaction(id)
    useSystemStore().adjustCount('externalTransactions', -1)
    invalidateDerived()
    if (externalRows.value.length === 1 && externalPage.value > 1) {
      externalPage.value -= 1
    }
    await loadExternalTransactions()
  }

  function reset(): void {
    transactionRows.value = []
    transactionTotal.value = 0
    transactionPage.value = 1
    transactionQuery.value = {}
    externalRows.value = []
    externalTotal.value = 0
    externalPage.value = 1
    externalQuery.value = {}
  }

  return {
    // 普通收支
    transactionRows,
    transactionTotal,
    transactionPage,
    transactionLimit,
    transactionQuery,
    transactionLoading,
    transactionError,
    transactionTotalPages,
    loadTransactions,
    applyTransactionQuery,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    // 外部往来
    externalRows,
    externalTotal,
    externalPage,
    externalLimit,
    externalQuery,
    externalLoading,
    externalError,
    externalTotalPages,
    loadExternalTransactions,
    applyExternalQuery,
    createExternalTransaction,
    updateExternalTransaction,
    deleteExternalTransaction,
    reset,
  }
})
